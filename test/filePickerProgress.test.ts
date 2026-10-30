import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindFilePickerProgress } from '../src/core/filePickerProgress';

function fixture(files: FileList | null) {
  const input = Object.assign(new EventTarget(), { files });
  const progress = {
    waiting: vi.fn(), received: vi.fn(), recreate: vi.fn(),
    load: vi.fn(async (_files: FileList) => {}), cancel: vi.fn(), error: vi.fn(),
  };
  const picker = bindFilePickerProgress(input as unknown as HTMLInputElement, progress);
  return { input, progress, picker };
}
afterEach(() => vi.useRealTimers());

describe('native picker progress', () => {
  it('shows waiting before a delayed FileList, then paints before reading any files', async () => {
    vi.useFakeTimers();
    const read = vi.fn(() => { throw new Error('must not eagerly enumerate'); });
    const files = { length: 5000, get 0() { return read(); } } as unknown as FileList;
    const { input, progress } = fixture(files);
    input.dispatchEvent(new Event('click'));
    await vi.advanceTimersByTimeAsync(180000);
    expect(progress.waiting).toHaveBeenCalledOnce();
    expect(progress.cancel).not.toHaveBeenCalled();
    input.dispatchEvent(new Event('change'));
    expect(progress.received).toHaveBeenCalledWith(5000);
    expect(progress.load).not.toHaveBeenCalled();
    expect(progress.recreate).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(progress.load.mock.calls[0][0]).toBe(files);
    expect(progress.recreate).toHaveBeenCalledOnce();
    expect(read).not.toHaveBeenCalled();
  });
  it('clears waiting on cancel and on an empty change', () => {
    const { input, progress } = fixture(null);
    input.dispatchEvent(new Event('click'));
    input.dispatchEvent(new Event('cancel'));
    expect(progress.cancel).toHaveBeenCalledOnce();
    input.dispatchEvent(new Event('change'));
    expect(progress.cancel).toHaveBeenCalledTimes(2);
    expect(progress.load).not.toHaveBeenCalled();
  });
  it('reports a loading failure and ignores stale cancel after change', async () => {
    vi.useFakeTimers();
    const { input, progress } = fixture({ length: 1 } as FileList);
    const error = new Error('disconnected storage');
    progress.load.mockRejectedValueOnce(error);
    input.dispatchEvent(new Event('click'));
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('cancel'));
    await vi.runAllTimersAsync();
    expect(progress.cancel).not.toHaveBeenCalled();
    expect(progress.error).toHaveBeenCalledWith(error);
  });
});


it('discards a late iOS FileList after the user cancels', async () => {
  vi.useFakeTimers();
  const { input, progress, picker } = fixture({ length: 100 } as FileList);
  input.dispatchEvent(new Event('click'));
  picker.cancel();
  input.dispatchEvent(new Event('change'));
  await vi.runAllTimersAsync();
  expect(progress.received).not.toHaveBeenCalled();
  expect(progress.load).not.toHaveBeenCalled();
});
it('cancels between the initial status paint and processing', async () => {
  vi.useFakeTimers();
  const { input, progress, picker } = fixture({ length: 100 } as FileList);
  input.dispatchEvent(new Event('change'));
  picker.cancel();
  await vi.runAllTimersAsync();
  expect(progress.load).not.toHaveBeenCalled();
});
