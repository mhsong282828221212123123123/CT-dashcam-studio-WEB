import { yieldToCompositor } from './clipScanner';

interface PickerProgress {
  waiting(): void;
  received(count: number): void;
  recreate(): void;
  load(files: FileList): Promise<void>;
  cancel(): void;
  error(error: unknown): void;
}

/** Keep the original FileList: copying it eagerly can block before the first paint. */
export function bindFilePickerProgress(input: HTMLInputElement, progress: PickerProgress) {
  let waiting = false;
  let cancelled = false;
  let attempt = 0;
  input.addEventListener('click', () => {
    attempt++;
    cancelled = false;
    waiting = true;
    progress.waiting();
    // Do not await or preventDefault here: the native picker needs the user gesture.
  });
  input.addEventListener('cancel', () => {
    if (waiting) progress.cancel();
    waiting = false;
    // The OS picker has closed now, so replacing the input is safe.
    progress.recreate();
  });
  input.addEventListener('change', async () => {
    waiting = false;
    if (cancelled) {
      // A late result completes the cancelled native session without loading it.
      progress.recreate();
      return;
    }
    const currentAttempt = attempt;
    const files = input.files;
    if (!files?.length) {
      progress.cancel();
      progress.recreate();
      return;
    }
    try {
      progress.received(files.length);
      await yieldToCompositor();
      if (cancelled || attempt !== currentAttempt) return;
      // Detaching the input preserves the captured FileList; never reset its value.
      progress.recreate();
      await progress.load(files);
    } catch (error) {
      if (!cancelled && attempt === currentAttempt) progress.error(error);
    }
  });
  return { cancel: () => { attempt++; cancelled = true; waiting = false; } };
}
