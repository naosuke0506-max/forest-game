// エンジンの起動：描画装置（WebGL2）を作り、必要な部品だけを登録する
import * as pc from 'playcanvas';

export async function createApp(canvas, quality) {
  // iPad での安定性を優先して WebGL2 を使う（PlayCanvas の WebGPU はまだベータ版）
  const device = await pc.createGraphicsDevice(canvas, {
    deviceTypes: [pc.DEVICETYPE_WEBGL2],
    antialias: quality.antialias,
    alpha: false,
    powerPreference: 'high-performance',
  });

  // 描画解像度の上限。iPad の画面は 2 倍密度なので、1.5 に抑えると画素数は約 56%
  device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);

  const options = new pc.AppOptions();
  options.graphicsDevice = device;
  options.componentSystems = [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
  ];
  // GLB（Meshy AI の模型）を後で読み込むための登録
  options.resourceHandlers = [pc.TextureHandler, pc.ContainerHandler];

  const app = new pc.AppBase(canvas);
  app.init(options);

  app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);

  // 画面の回転、Safari のアドレスバーの出入り、分割表示で大きさが変わったとき
  const resize = () => app.resizeCanvas();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  return { app, device };
}
