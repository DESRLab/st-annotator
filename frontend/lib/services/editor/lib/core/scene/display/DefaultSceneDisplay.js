import { OptionalVector3 } from '../../../../../../common/lib/spatial';

import { MainWindow } from './MainWindow';
import { MinimapWindow } from './MinimapWindow';

import { BaseSceneDisplay } from '../../../base';

/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('../../../base').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../../../base').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('../../../base').NavFrameEvent} NavFrameEvent
 */

/**
 * @typedef {{ main: MainWindow, minimap: MinimapWindow }} DefaultWindowMapper
 */

/**
 * Represents the default display of the application.
 * 
 * @augments {BaseSceneDisplay<DefaultWindowMapper>}
 */
export class DefaultSceneDisplay extends BaseSceneDisplay {

    /**
     * Handles the event when the context navigates to a different frame.
     * 
     * @param {NavFrameEvent} event The event to handle. 
     */
    #onNavFrame = ({ prevFrame, frame }) => {
        const {
            coordinateFormat,
            initCameraPosition: initDbPosition,
            initCameraTarget: initDbTarget,
        } = this.context.config;

        if (prevFrame != null && frame != null) {
            const prevThreePosition = this.windows.main.camera2D.position;
            const prevDbPosition = coordinateFormat.toDatabaseCoords(prevThreePosition);
            const { xBounds, yBounds } = frame.st_bounds.getSpatialBounds();

            // No need to pan the camera
            if (xBounds.contains(prevDbPosition.x) && yBounds.contains(prevDbPosition.y)) return;
        }

        const dbCenter = frame?.getSpatialCenter() ?? new OptionalVector3();
        const threeCenter = coordinateFormat.toThreeJSCoords(dbCenter);

        const initThreePosition = coordinateFormat.toThreeJSCoords(initDbPosition);
        const initThreeTarget = coordinateFormat.toThreeJSCoords(initDbTarget);

        this.setMainCameraPose(
            threeCenter.clone().fillScalar(0).add(initThreePosition),
            threeCenter.clone().fillScalar(0).add(initThreeTarget),
        );
    };

    /**
     * Creates a new default display.
     * 
     * @param {SceneContext<DefaultWindowMapper>} context A handle to the state of the scene.
     */
    constructor(context) {
        const mainWindow = new MainWindow('Main', 0);
        const minimapWindow = new MinimapWindow('Minimap', 1, context.config, mainWindow);

        super(context, {
            main: mainWindow,
            minimap: minimapWindow,
        });

        this.context.addEventListener('nav-frame', this.#onNavFrame);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.context.removeEventListener('nav-frame', this.#onNavFrame);

        super.dispose();
    }

    /**
     * Set the position and target of the cameras used to render the main window.
     * 
     * The other cameras are also updated accordingly.
     * 
     * @param {THREE.Vector3} position The position to set, in world space.
     * @param {THREE.Vector3} target The target coordinates to set, in world space.
     */
    setMainCameraPose(position, target) {
        // This should update the minimap automatically
        this.windows.main.setPose3D(position, target);
    }

    /**
     * Set the position of the cameras used to render the main window.
     * 
     * The other cameras are also updated accordingly.
     * 
     * The orbit target of each camera is also updated accordingly as if the
     * camera was panned.
     * 
     * @param {THREE.Vector3} position The position to set, in world space.
     */
    panMainCamera(position) {
        // This should update the minimap automatically
        this.windows.main.panCamera3D(position);
    }
}
