import "../editor/render-worker";
import { createSceneRenderer } from "./renderer";
import { validateScene } from "./schema";
const canvas = document.createElement("canvas");
document.body.append(canvas);
document.body.style.margin = "0";
let engine: Awaited<ReturnType<typeof createSceneRenderer>>;
Object.assign(window, {
  mouvaInitScene: async (input: any) => {
    validateScene(
      input.scene,
      new Set<string>(input.assets.map((a: any) => a.id)),
    );
    engine?.dispose();
    engine = await createSceneRenderer(canvas, input.scene, input.assets);
    engine.draw(0, input.width, input.height);
  },
  mouvaSceneFrame: (time: number) => {
    engine.draw(time);
    return canvas.toDataURL("image/png").split(",")[1];
  },
  mouvaDisposeScene: () => engine?.dispose(),
});
