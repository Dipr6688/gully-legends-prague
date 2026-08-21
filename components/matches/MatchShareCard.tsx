"use client";

import Image from "next/image";
import { Download, Share2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  MATCH_SHARE_CARD_HEIGHT,
  MATCH_SHARE_CARD_WIDTH,
  buildMatchShareCardViewModel,
  canUseNativeFileShare,
  getShareFailureMessage,
  renderMatchShareCardSvg,
  type MatchShareCardViewModel
} from "@/lib/match-share-card";
import type { PostMatchCelebrationSummary } from "@/lib/post-match-celebration";
import type { MatchRecord } from "@/lib/types/match";

const TROPHY_ASSET = "/ui/post-match-celebration/winner-trophy.svg";

type MatchShareCardDialogProps = {
  summary: PostMatchCelebrationSummary;
  match: MatchRecord;
  mode: "live" | "historical";
  onClose: () => void;
};

async function imageToDataUrl(path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;

  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Unable to load share card asset: ${path}`);
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function svgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new window.Image();

    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Share card image render failed.")), {
        once: true
      });
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = MATCH_SHARE_CARD_WIDTH;
    canvas.height = MATCH_SHARE_CARD_HEIGHT;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }

    context.drawImage(image, 0, 0, MATCH_SHARE_CARD_WIDTH, MATCH_SHARE_CARD_HEIGHT);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("PNG export failed."));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function createShareCardPng(viewModel: MatchShareCardViewModel): Promise<Blob> {
  const [logo, trophy, pomImage] = await Promise.all([
    imageToDataUrl(viewModel.logoPath),
    imageToDataUrl(TROPHY_ASSET),
    imageToDataUrl(viewModel.pom?.cardImage)
  ]);
  const svg = renderMatchShareCardSvg(viewModel, {
    logo,
    trophy,
    pomImage
  });

  return svgToPngBlob(svg);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

function MatchShareCardPreview({ viewModel }: { viewModel: MatchShareCardViewModel }) {
  const primaryHighlight = viewModel.highlights[0];
  const secondaryHighlight = viewModel.highlights[1];

  return (
    <article
      className="match-share-card-preview"
      aria-label="Match result card preview"
      style={{
        aspectRatio: `${MATCH_SHARE_CARD_WIDTH} / ${MATCH_SHARE_CARD_HEIGHT}`
      }}
    >
      <div className="match-share-card-border" aria-hidden="true" />
      <header className="match-share-brand-row">
        <Image
          src={viewModel.logoPath}
          alt="Gully Legends Prague"
          width={300}
          height={120}
          priority
        />
        <div>
          <p>{viewModel.brandTitle}</p>
          <span>{viewModel.tagline}</span>
        </div>
      </header>

      <div className="match-share-meta-strip">
        <strong>
          {[viewModel.gameLabel, viewModel.dateLabel, viewModel.scheduledOversLabel]
            .filter(Boolean)
            .join(" | ")}
        </strong>
        <span>{viewModel.venue}</span>
      </div>

      <section className="match-share-result-hero">
        <Image src={TROPHY_ASSET} alt="" width={126} height={126} />
        <h3>{viewModel.outcomeTitle}</h3>
        <p>{viewModel.resultHeadline}</p>
      </section>

      <div className="match-share-score-grid">
        {viewModel.scoreRows.map((row) => (
          <div key={row.teamId}>
            <span>{row.teamName}</span>
            <b>{row.score}</b>
            <em>({row.overs})</em>
          </div>
        ))}
      </div>

      {viewModel.pom ? (
        <section className="match-share-pom">
          <div className="match-share-pom-artwork">
            <Image
              src={viewModel.pom.cardImage}
              alt={`${viewModel.pom.name} - ${viewModel.pom.cardTitle}`}
              fill
              sizes="150px"
              className="object-contain object-center"
            />
          </div>
          <div>
            <p>Player of the Match</p>
            <h4>{viewModel.pom.name}</h4>
            <strong>
              {viewModel.pom.contributions.length > 0
                ? viewModel.pom.contributions.join(" - ")
                : "Gully energy unlocked"}
            </strong>
          </div>
        </section>
      ) : (
        <section className="match-share-no-pom">
          <p>No Player of the Match awarded</p>
          <span>The whole gully takes the story home.</span>
        </section>
      )}

      {primaryHighlight ? (
        <div className="match-share-highlight-row">
          {[primaryHighlight, secondaryHighlight].filter(Boolean).map((highlight) => (
            <section key={`${highlight?.type}-${highlight?.playerName}`} className="match-share-highlight">
              <p>{highlight?.title}</p>
              <strong>
                {highlight?.playerName} - {highlight?.metricText}
              </strong>
              <span>{highlight?.subtext}</span>
            </section>
          ))}
        </div>
      ) : null}

      <footer>No Rules. Only Fun!</footer>
    </article>
  );
}

export function MatchShareCardDialog({
  summary,
  match,
  mode,
  onClose
}: MatchShareCardDialogProps) {
  const viewModel = useMemo(
    () => buildMatchShareCardViewModel({ summary, match, mode }),
    [match, mode, summary]
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function generatePng(): Promise<Blob | null> {
    setIsGenerating(true);
    setStatusMessage(null);

    try {
      return await createShareCardPng(viewModel);
    } catch (error) {
      console.error(error);
      setStatusMessage("The card could not be generated. Please try again.");
      return null;
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleShare() {
    const blob = await generatePng();

    if (!blob) return;

    const file = new File([blob], viewModel.filename, { type: "image/png" });
    const navigatorLike = navigator as typeof navigator & {
      share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
      canShare?: (data: { files?: File[] }) => boolean;
    };

    if (!canUseNativeFileShare(navigatorLike, [file])) {
      downloadBlob(blob, viewModel.filename);
      setStatusMessage("Native sharing is not available here, so the card was saved instead.");
      return;
    }

    try {
      await navigatorLike.share?.({
        files: [file],
        title: "Gully Legends Match Result",
        text: viewModel.resultHeadline
      });
      setStatusMessage("Share sheet opened.");
    } catch (error) {
      const message = getShareFailureMessage(error);

      if (message) setStatusMessage(message);
    }
  }

  async function handleDownload() {
    const blob = await generatePng();

    if (!blob) return;

    downloadBlob(blob, viewModel.filename);
    setStatusMessage(`Saved ${viewModel.filename}.`);
  }

  return (
    <div className="match-share-dialog-backdrop" role="presentation">
      <section
        className="match-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-share-dialog-title"
      >
        <button
          type="button"
          className="match-share-dialog-close"
          onClick={onClose}
          aria-label="Close share match card preview"
        >
          <X aria-hidden="true" />
        </button>
        <div className="match-share-dialog-copy">
          <p>{mode === "historical" ? "Historical Replay Card" : "Ready for the group chat"}</p>
          <h3 id="match-share-dialog-title">Share Match Card</h3>
          <span>
            A portrait PNG preview built from the official celebration summary.
          </span>
        </div>
        <div className="match-share-preview-shell">
          <MatchShareCardPreview viewModel={viewModel} />
        </div>
        <div className="match-share-dialog-actions">
          <Button type="button" onClick={handleShare} disabled={isGenerating}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {isGenerating ? "Preparing..." : "Share"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleDownload}
            disabled={isGenerating}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Save Image
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        {statusMessage ? (
          <p className="match-share-status" role="status">
            {statusMessage}
          </p>
        ) : null}
      </section>
    </div>
  );
}
