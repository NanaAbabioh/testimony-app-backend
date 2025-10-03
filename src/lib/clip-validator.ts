// Clip validation utilities for detecting suspicious time data
export interface ClipValidationResult {
  isValid: boolean;
  issues: string[];
  severity: 'low' | 'medium' | 'high';
  suggestedAction: string;
}

export interface ClipTimeData {
  id: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  episode?: string;
  title?: string;
}

export function validateClipTiming(clip: ClipTimeData): ClipValidationResult {
  const issues: string[] = [];
  let severity: 'low' | 'medium' | 'high' = 'low';
  
  const duration = clip.endTimeSeconds - clip.startTimeSeconds;
  
  // Check 1: Negative duration (end time before start time)
  if (duration < 0) {
    issues.push(`Negative duration: End time (${clip.endTimeSeconds}s) is before start time (${clip.startTimeSeconds}s)`);
    severity = 'high';
  }
  
  // Check 2: Zero duration
  if (duration === 0) {
    issues.push('Zero duration: Start and end times are identical');
    severity = 'medium';
  }
  
  // Check 3: Extremely long clips (typical testimonies are 1-10 minutes)
  if (duration > 1800) { // More than 30 minutes
    const durationMinutes = Math.floor(duration / 60);
    issues.push(`Unusually long clip: ${durationMinutes} minutes (typical testimonies are 1-10 minutes)`);
    severity = 'high';
  }
  
  // Check 4: Very short clips (less than 30 seconds might be accidental)
  if (duration > 0 && duration < 30) {
    issues.push(`Very short clip: ${duration} seconds (might be too brief for a testimony)`);
    severity = 'low';
  }
  
  // Check 5: Unrealistic start times (more than 4 hours into video)
  if (clip.startTimeSeconds > 14400) { // More than 4 hours
    const startHours = Math.floor(clip.startTimeSeconds / 3600);
    const startMinutes = Math.floor((clip.startTimeSeconds % 3600) / 60);
    issues.push(`Very late start time: ${startHours}h ${startMinutes}m into video (might be conversion error)`);
    severity = 'high';
  }
  
  // Check 6: Pattern detection for common conversion errors
  // Look for times that might be incorrectly converted from MM:SS format
  const suspiciousPatterns = detectSuspiciousTimePatterns(clip.startTimeSeconds, clip.endTimeSeconds);
  if (suspiciousPatterns.length > 0) {
    issues.push(...suspiciousPatterns);
    if (severity === 'low') severity = 'medium';
  }
  
  const isValid = issues.length === 0;
  
  let suggestedAction = 'No action needed';
  if (severity === 'high') {
    suggestedAction = 'Review immediately - likely data corruption';
  } else if (severity === 'medium') {
    suggestedAction = 'Review when convenient - unusual but might be valid';
  }
  
  return {
    isValid,
    issues,
    severity,
    suggestedAction
  };
}

function detectSuspiciousTimePatterns(startSec: number, endSec: number): string[] {
  const patterns: string[] = [];
  
  // Pattern 1: Times that look like they might be minutes*3600 instead of minutes*60
  // E.g., 50:57 incorrectly converted as (50*3600 + 57) instead of (50*60 + 57)
  if (startSec > 7200) { // More than 2 hours
    const possibleMinutes = Math.floor(startSec / 3600);
    const remainder = startSec % 3600;
    if (remainder < 60 && possibleMinutes < 90) {
      patterns.push(`Start time might be incorrectly converted: ${startSec}s could be ${possibleMinutes}:${remainder.toString().padStart(2, '0')} (${possibleMinutes}m ${remainder}s)`);
    }
  }
  
  if (endSec > 7200) {
    const possibleMinutes = Math.floor(endSec / 3600);
    const remainder = endSec % 3600;
    if (remainder < 60 && possibleMinutes < 90) {
      patterns.push(`End time might be incorrectly converted: ${endSec}s could be ${possibleMinutes}:${remainder.toString().padStart(2, '0')} (${possibleMinutes}m ${remainder}s)`);
    }
  }
  
  return patterns;
}

export function formatTimeForDisplay(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

export function batchValidateClips(clips: ClipTimeData[]): {
  validClips: ClipTimeData[];
  flaggedClips: Array<ClipTimeData & { validation: ClipValidationResult }>;
  summary: {
    total: number;
    valid: number;
    flagged: number;
    highSeverity: number;
    mediumSeverity: number;
    lowSeverity: number;
  };
} {
  const validClips: ClipTimeData[] = [];
  const flaggedClips: Array<ClipTimeData & { validation: ClipValidationResult }> = [];
  
  let highSeverity = 0;
  let mediumSeverity = 0;
  let lowSeverity = 0;
  
  for (const clip of clips) {
    const validation = validateClipTiming(clip);
    
    if (validation.isValid) {
      validClips.push(clip);
    } else {
      flaggedClips.push({ ...clip, validation });
      
      if (validation.severity === 'high') highSeverity++;
      else if (validation.severity === 'medium') mediumSeverity++;
      else lowSeverity++;
    }
  }
  
  return {
    validClips,
    flaggedClips,
    summary: {
      total: clips.length,
      valid: validClips.length,
      flagged: flaggedClips.length,
      highSeverity,
      mediumSeverity,
      lowSeverity
    }
  };
}