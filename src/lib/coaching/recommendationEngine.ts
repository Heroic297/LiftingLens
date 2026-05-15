import type { Recommendation, SetResult } from '../../types/training';

interface CoachingInput {
  set: SetResult;
  targetRPE?: number;
  plannedLoad?: number;
  userPerceivedRPE?: number;
  defaultIncrement: number;
  units: 'lb' | 'kg';
}

export function generateRecommendation(input: CoachingInput): Recommendation {
  const { set, targetRPE, plannedLoad, userPerceivedRPE, defaultIncrement, units } = input;
  const reasoning: string[] = [];
  let action: Recommendation['action'] = 'info';
  let amountSuggestion = '';

  // Low confidence gate
  if (set.confidence < 0.4) {
    reasoning.push('Tracking confidence is low — velocity data may be unreliable.');
    return {
      action: 'info',
      amountSuggestion: '',
      message: 'Do not adjust load based on this set alone due to low tracking confidence.',
      reasoning,
    };
  }

  reasoning.push(`Set average velocity: ${set.setAvgVelocity.toFixed(3)} ${set.isCalibrated ? 'm/s' : 'rel'}`);
  reasoning.push(`Velocity loss: ${set.velocityLoss.toFixed(1)}%`);

  // Velocity loss checks
  if (set.velocityLoss > 20 && set.repCount > 1) {
    action = 'hold';
    reasoning.push('Velocity loss >20% suggests accumulated fatigue within this set.');
  }

  if (set.reps.length >= 2) {
    const firstRepVel = set.reps[0].meanConcentricVelocity;
    const lastRepVel = set.reps[set.reps.length - 1].meanConcentricVelocity;
    const withinSetLoss = firstRepVel > 0 ? ((firstRepVel - lastRepVel) / firstRepVel) * 100 : 0;
    if (withinSetLoss > 25) {
      reasoning.push(`Last rep was ${withinSetLoss.toFixed(0)}% slower than first rep — significant fatigue.`);
      if (action === 'info') action = 'hold';
    }
  }

  // RPE-based checks
  if (targetRPE !== undefined && userPerceivedRPE !== undefined) {
    reasoning.push(`Target RPE: ${targetRPE}, User-reported RPE: ${userPerceivedRPE}`);
    const rpeDiff = userPerceivedRPE - targetRPE;

    if (rpeDiff >= 1) {
      action = 'reduce';
      amountSuggestion = `−${defaultIncrement} ${units}`;
      reasoning.push('Perceived RPE is higher than target — reduce load.');
    } else if (rpeDiff <= -1 && set.velocityLoss < 15) {
      action = 'add';
      amountSuggestion = `+${defaultIncrement * 2} ${units}`;
      reasoning.push('Perceived RPE is lower than target and velocity looks good — add load.');
    } else if (rpeDiff === 0) {
      reasoning.push('RPE matches target.');
      if (action === 'info') action = 'hold';
    }
  } else if (!targetRPE && !plannedLoad) {
    reasoning.push('No program target — providing descriptive feedback only.');
  }

  // Default messages
  const messages: Record<Recommendation['action'], string> = {
    add: `Consider adding ${amountSuggestion} for the next set.`,
    hold: 'Hold the current load for the next set.',
    reduce: `Consider reducing ${amountSuggestion || `${defaultIncrement} ${units}`} for the next set.`,
    info: 'No load adjustment suggested — keep monitoring.',
  };

  return {
    action,
    amountSuggestion,
    message: messages[action],
    reasoning,
  };
}
