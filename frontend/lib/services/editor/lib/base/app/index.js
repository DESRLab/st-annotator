export * from './widgets';

/**
 * @typedef {import('./App').MenuMapper} MenuMapper
 */

/**
 * @typedef {import('./FramePlayback').FramePlaybackEventMap} FramePlaybackEventMap
 */

/**
 * @typedef {import('./Keybinds').Keybind} Keybind
 */

/**
 * @typedef {import('./Keybinds').KeyComboEventHandlerFn} KeyComboEventHandlerFn
 */

/**
 * @typedef {import('./Keybinds').KeybindHandlerEventMap} KeybindHandlerEventMap
 */

/**
 * @typedef {import('./Keybinds').KeybindHandler} KeybindHandler
 */

export { App } from './App';
export { FramePlayback } from './FramePlayback';
export {
    ComposableKeybindHandler, KeybindHandlerGlobalContext,
    getKeyComboHTMLText, getKeybindHTMLText,
} from './Keybinds';
