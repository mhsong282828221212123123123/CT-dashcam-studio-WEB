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
  input.addEventListener('click', () => {
    waiting = true;
    progress.waiting();
    // Do not await or preventDefault here: the native picker needs the user gesture.
  });
  input.addEventListener('cancel', () => {
    if (waiting) progress.cancel();
    waiting = false;
  });
  input.addEventListener('change', async () => {
    waiting = false;
    const files = input.files;
    if (!files?.length) {
      progress.cancel();
      progress.recreate();
      return;
    }
    try {
      progress.received(files.length);
      await yieldToCompositor();
      // Detaching the input preserves the captured FileList; never reset its value.
      progress.recreate();
      await progress.load(files);
    } catch (error) {
      progress.error(error);
    }
  });
}
