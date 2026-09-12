/**
 * `@hestia/ui-scene3d` — the 3D scene graph, moved over from MyCastle's
 * `core-scene3d`: nodes, geometry and geometry nodes, serialisation, import and
 * export (GLTF, FBX, OBJ, STL), animation, prefabs, and `SimpleViewer` over
 * `@react-three/fiber`.
 *
 * `three` and its React bindings are **peers**, not dependencies: an object
 * built by one copy of three is foreign to another, the same reason React is a
 * peer everywhere here.
 *
 * The viewers built on top of this — CAD, electronics, PCB, map, notes — live
 * behind `@hestia/ui-scene3d/cad-viewer`, so that a page which only needs a scene
 * does not carry Leaflet and the page shells.
 */
export * from './scene3d';
