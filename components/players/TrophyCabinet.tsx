import Image from "next/image";
import {
  buildTrophyCabinetViewModel,
  formatAchievementUnlockMeta,
  formatMilestoneProgressLabel,
  getAchievementIconPath,
  getMilestoneProgressPercent
} from "@/lib/trophy-cabinet";
import type {
  AchievementUnlock,
  CareerMilestoneProgress,
  PlayerAchievements
} from "@/lib/player-achievements";

function TrophyBadge({
  unlock,
  variant = "compact"
}: {
  unlock: AchievementUnlock;
  variant?: "featured" | "compact";
}) {
  return (
    <article
      className={`trophy-badge-card trophy-badge-card-${variant}`}
      data-tier={unlock.definition.tier ?? "bronze"}
    >
      <div className="trophy-badge-icon">
        <Image
          src={getAchievementIconPath(unlock.definition.iconKey)}
          alt=""
          width={82}
          height={82}
        />
      </div>
      <div>
        <p>{unlock.definition.tier ?? "badge"}</p>
        <h4>{unlock.definition.title}</h4>
        <span>{unlock.definition.description}</span>
        <em className="data-number">{formatAchievementUnlockMeta(unlock)}</em>
      </div>
    </article>
  );
}

function MilestoneProgressCard({ progress }: { progress: CareerMilestoneProgress }) {
  const width = `${getMilestoneProgressPercent(progress)}%`;

  return (
    <article className="trophy-progress-card">
      <div className="trophy-progress-heading">
        <div className="trophy-progress-icon">
          <Image
            src={getAchievementIconPath(progress.definition.iconKey)}
            alt=""
            width={58}
            height={58}
          />
        </div>
        <div>
          <p>{progress.definition.category}</p>
          <h4>{progress.definition.title}</h4>
        </div>
      </div>
      <div className="trophy-progress-meter" aria-hidden="true">
        <span style={{ width }} />
      </div>
      <strong className="data-number-strong">
        {formatMilestoneProgressLabel(progress)}
      </strong>
      <span>{progress.definition.description}</span>
    </article>
  );
}

export function TrophyCabinet({
  achievements
}: {
  achievements: PlayerAchievements;
}) {
  const viewModel = buildTrophyCabinetViewModel(achievements);
  const unlockedCount = achievements.unlocked.length;
  const standardUnlocks = viewModel.sections.flatMap((section) => section.unlocks);

  return (
    <section className="trophy-cabinet-section" aria-labelledby="trophy-cabinet-title">
      <div className="trophy-cabinet-layout">
        <div className="trophy-cabinet-main">
          <div className="trophy-cabinet-header">
            <div>
              <p>Career Milestones</p>
              <h2 id="trophy-cabinet-title">Trophy Cabinet</h2>
            </div>
            <strong className="data-number-strong">{unlockedCount} unlocked</strong>
          </div>

          {viewModel.featuredUnlocks.length > 0 ? (
            <div className="trophy-featured-grid" aria-label="Featured trophies">
              {viewModel.featuredUnlocks.map((unlock) => (
                <TrophyBadge
                  key={`${unlock.playerId}-${unlock.definition.id}`}
                  unlock={unlock}
                  variant="featured"
                />
              ))}
            </div>
          ) : (
            <div className="trophy-empty-state">
              <p>First trophy still loading.</p>
              <span>Official matches will fill this cabinet when milestones are unlocked.</span>
            </div>
          )}

          {standardUnlocks.length > 0 ? (
            <div className="trophy-category-stack">
              <h3>Unlocked Achievements</h3>
              <div className="trophy-badge-grid trophy-badge-grid-unlocked">
                {standardUnlocks.map((unlock) => (
                  <TrophyBadge
                    key={`unlocked-${unlock.playerId}-${unlock.definition.id}`}
                    unlock={unlock}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {viewModel.visibleNextMilestones.length > 0 ? (
          <section className="trophy-next-section" aria-label="Current milestone progress">
            <h3>Next Targets</h3>
            <div className="trophy-progress-grid">
              {viewModel.visibleNextMilestones.map((progress) => (
                <MilestoneProgressCard
                  key={`${progress.playerId}-${progress.definition.id}`}
                  progress={progress}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {viewModel.hasUnknownProgress ? (
        <p className="trophy-legacy-note">
          Some legacy six-hitting progress is shown only when ball-by-ball data is available.
        </p>
      ) : null}
    </section>
  );
}
