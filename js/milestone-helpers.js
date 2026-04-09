export function reconcileMilestoneState(rawMilestones = {}, milestoneDefs = {}, options = {}) {
    const today = String(options.today || '').trim();
    const statMap = options.statMap && typeof options.statMap === 'object' ? options.statMap : null;
    const milestones = Object.fromEntries(
        Object.entries(rawMilestones || {}).map(([key, value]) => [key, value && typeof value === 'object' ? { ...value } : value])
    );

    let changed = false;
    const freshMilestones = [];

    for (const [category, catData] of Object.entries(milestoneDefs || {})) {
        const levels = Array.isArray(catData?.levels) ? catData.levels : [];
        const categoryValue = statMap ? Number(statMap[category] || 0) : Number.NaN;

        let highestAchievedIndex = -1;
        let highestClaimedIndex = -1;
        levels.forEach((level, index) => {
            const entry = milestones[level.id];
            if (entry?.achieved) highestAchievedIndex = index;
            if (entry?.bonusClaimed) highestClaimedIndex = index;
        });

        const originalHighestAchievedIndex = highestAchievedIndex;
        const originalHighestClaimedIndex = highestClaimedIndex;

        let highestQualifiedIndex = -1;
        if (Number.isFinite(categoryValue)) {
            levels.forEach((level, index) => {
                if (categoryValue >= Number(level.target || 0)) highestQualifiedIndex = index;
            });
        }

        const achievedThroughIndex = Math.max(highestAchievedIndex, highestClaimedIndex, highestQualifiedIndex);
        for (let index = 0; index <= achievedThroughIndex; index += 1) {
            const level = levels[index];
            if (!level) continue;

            const existing = milestones[level.id] && typeof milestones[level.id] === 'object' ? milestones[level.id] : {};
            if (existing.achieved) continue;

            milestones[level.id] = {
                ...existing,
                achieved: true,
                date: existing.date || today,
                bonusClaimed: existing.bonusClaimed === true
            };
            changed = true;

            const isFreshMilestone =
                Number.isFinite(categoryValue)
                && highestQualifiedIndex === index
                && categoryValue === Number(level.target || 0)
                && originalHighestAchievedIndex < index
                && originalHighestClaimedIndex < index;

            if (isFreshMilestone) {
                freshMilestones.push(level);
            }
        }

        if (highestClaimedIndex >= 0) {
            for (let index = 0; index < highestClaimedIndex; index += 1) {
                const level = levels[index];
                if (!level) continue;

                const existing = milestones[level.id] && typeof milestones[level.id] === 'object' ? milestones[level.id] : {};
                if (existing.bonusClaimed) continue;

                milestones[level.id] = {
                    ...existing,
                    achieved: true,
                    date: existing.date || today,
                    bonusClaimed: true,
                    bonusAmount: typeof existing.bonusAmount === 'number' ? existing.bonusAmount : 0,
                    normalizedFromHigherClaim: true
                };
                changed = true;
            }
        }
    }

    return { milestones, changed, freshMilestones };
}
