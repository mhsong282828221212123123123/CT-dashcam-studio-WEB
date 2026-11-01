import { describe, expect, it } from 'vitest';
import { detectTutorialPlatform, tutorialLoadAction, tutorialStep, TutorialPlatform } from '../src/core/tutorial';
import { TRANSLATIONS, SupportedLang } from '../src/core/i18n';
import { TUTORIAL_STRINGS } from '../src/core/locales/tutorial';

describe('platform-specific getting-started tutorial', () => {
  it.each([
    [{userAgent:'Windows Chrome'},'pc'],
    [{userAgent:'Linux Android Chrome'},'android'],
    [{userAgent:'iPhone Safari'},'ios'],
    [{userAgent:'iPad Safari'},'ios'],
    [{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:5},'ios'],
    [{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:0},'pc'],
  ])('detects the actual platform %j', (device, expected) => {
    expect(detectTutorialPlatform(device)).toBe(expected);
  });
  it.each(['pc','android','ios'] as TutorialPlatform[])('%s has only load, range and export steps', platform => {
    expect([0,1,2].map(step => tutorialStep(platform,step).heading)).toEqual(['tutorial_load','tutorial_range','tutorial_export']);
    expect(tutorialStep(platform,0).body).toBe(`tutorial_${platform}_load`);
    expect(tutorialStep(platform,2).body).toBe(`tutorial_${platform}_export`);
  });
  it('uses folder import as the normal flow on all platforms, including iPhone', () => {
    expect(tutorialLoadAction('pc')).toBe('btn_open_folder');
    expect(tutorialLoadAction('android')).toBe('btn_open_folder_mobile');
    expect(tutorialLoadAction('ios')).toBe('btn_open_folder_mobile');
  });
  it('shows the USB warning specifically on the iPhone import step', () => {
    expect(tutorialStep('ios',0).warning).toBe(true);
    for (const p of ['pc','android','ios'] as TutorialPlatform[]) for (let step=0;step<3;step++) {
      if(p==='ios' && step===0)continue;
      expect(tutorialStep(p,step).warning).toBe(false);
    }
  });
  it('clamps navigation to valid steps',()=>{
    expect(tutorialStep('pc',-1).heading).toBe('tutorial_load');
    expect(tutorialStep('pc',3).heading).toBe('tutorial_export');
    expect(tutorialStep('pc',NaN).heading).toBe('tutorial_load');
  });
  it.each(Object.keys(TUTORIAL_STRINGS) as SupportedLang[])('%s includes every tutorial string and each device flow', lang => {
    expect(Object.keys(TUTORIAL_STRINGS[lang]).sort()).toEqual(Object.keys(TUTORIAL_STRINGS.en).sort());
    for(const key of Object.keys(TUTORIAL_STRINGS.en)) expect(TRANSLATIONS[lang][key]?.trim()).toBeTruthy();
    for(const p of ['pc','android','ios'] as TutorialPlatform[]) for(let step=0;step<3;step++){
      const state=tutorialStep(p,step);
      expect(TRANSLATIONS[lang][state.body]).toBeTruthy();
    }
    expect(TUTORIAL_STRINGS[lang].tutorial_warning).toContain('USB');
    expect(TUTORIAL_STRINGS[lang].tutorial_warning).toContain('Air');
  });
});
