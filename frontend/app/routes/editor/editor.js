// import {
//     App, LayerCollection, SceneContext,
//     ProjectMenu, ToolsMenu, ObjectTreeMenu, LayersMenu,
//     EditorViews,
// } from 'sta/services/editor/base';
// import { DefaultSceneDisplay } from 'sta/services/editor/core';
// import { initApp, loadEditor } from 'sta/services/editor/static';

// import { GroundMeshLayer } from 'sta-gmesh/editor';
// import { BBoxLayer } from 'sta-bbox/editor';
// import { MainCameraPreferencesMenu, PointCloudLayer } from 'sta-pcd/editor';
// import { SegmentationLayer } from 'sta-segmentation/editor';
// import { VectorLayer } from 'sta-vector/editor';

// /**
//  * @typedef {import('sta/services/editor/core').DefaultWindowMapper} DefaultWindowMapper
//  */

// window.onload = () => loadEditor(async (dom, loadOptions) => {
//     const views = new EditorViews();

//     /**
//      * @type {SceneContext<DefaultWindowMapper>}
//      */
//     const context = await SceneContext.create(views);

//     const display = new DefaultSceneDisplay(context);
//     await context.bindDisplay(display);

//     const pcdLayer = PointCloudLayer.create(context, 'Point Cloud');
//     const gmeshLayer = GroundMeshLayer.create(context, 'Ground Mesh');
//     const bboxLayer = BBoxLayer.create(context, 'Bounding Box', pcdLayer, gmeshLayer);
//     const vectorLayer = VectorLayer.create(context, 'Vector', pcdLayer, gmeshLayer);
//     const segmentationLayer = SegmentationLayer.create(context, 'Segmentation', pcdLayer);

//     const layers = new LayerCollection({
//         pcd: pcdLayer,
//         gmesh: gmeshLayer,
//         bbox: bboxLayer,
//         vector: vectorLayer,
//         segmentation: segmentationLayer,
//     });
//     await context.bindLayers(layers);

//     const menus = {
//         project: new ProjectMenu(context),
//         tools: new ToolsMenu(layers),
//         prefs: new MainCameraPreferencesMenu(layers, display.windows.main, pcdLayer),
//         objectTree: new ObjectTreeMenu(layers),
//         layers: new LayersMenu(layers),
//     };

//     const app = new App(context, layers, menus);
//     await initApp(dom, loadOptions, app);
// });
