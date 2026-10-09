import * as THREE from 'three';

/**
 * @typedef {import('./SceneDisplay').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('./SceneDisplay').SceneDisplay<WM>} SceneDisplay
 */

/**
 * Helper class to render a scene.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 */
export class SceneRenderer {

    /**
     * The display to render the scene to.
     * 
     * @readonly
     * @type {SceneDisplay<WM>}
     */
    display;

    /**
     * The renderer of the scene.
     * 
     * @readonly
     * @type {THREE.WebGLRenderer}
     */
    renderer;

    /**
     * Creates a new scene renderer.
     * 
     * @param {SceneDisplay<WM>} display The display to render the scene to.
     */
    constructor(display) {
        this.display = display;

        this.renderer = new THREE.WebGLRenderer({ canvas: display.canvas, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setScissorTest(true);
    }

    /**
     * Renders a scene to the display.
     * 
     * @param {THREE.Scene} scene The scene to render.
     */
    render(scene) {
        const { renderer } = this;

        const canvas = renderer.domElement;
        const { width: canvasWidth, height: canvasHeight } = canvas.getBoundingClientRect();

        if (canvas.parentElement != null) {
            if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
                renderer.setSize(canvasWidth, canvasHeight, false);
            }
        }

        for (const window of Object.values(this.display.windows)) {
            const rect = window.dom.getBoundingClientRect();

            // The offsets keep the rendered portion entirely inside of `window.dom`
            const width = Math.max(rect.width - 1, 0);
            const height = Math.max(rect.height - 1, 0);
            const left = rect.left + 1;
            const bottom = canvasHeight - rect.bottom + 1;

            const camera = window.getCamera();
            camera.layers.set(window.layerId);

            // https://threejs.org/examples/#webgl_multiple_elements
            renderer.setViewport(left, bottom, width, height);
            renderer.setScissor(left, bottom, width, height);
            renderer.render(scene, camera);
        }
    }
}
