// 風：木と草を揺らす。頂点の位置を GPU（頂点シェーダー）で動かすので、CPU の負担はほぼ無い。
//
// エンジンの「頂点の位置を決める部分」（シェーダーの部品 transformVS）を、木と草のマテリアルだけ差し替える。
//   ・しなり ：高い所ほど大きく傾く（高さの 2 乗）。根元はほとんど動かない
//   ・ずれ   ：木ごとに揺れのタイミングをずらす（全部の木がそろって揺れないように）
//   ・突風   ：風の強さがときどき強まる（ゲーム側でなめらかに変える）
//   ・そよぎ ：高い所ほど、細かく速い揺れを足す（葉がそよぐ感じ）
// 影を描くときも同じ部品が使われるので、影も一緒に揺れる。
import * as pc from 'playcanvas';

// 元の transformVS（PlayCanvas 2.23.3）に、風の分だけ足したもの。
// エンジンの版を上げるときは、元の部品の内容が変わっていないか確かめること
const WIND_TRANSFORM_VS = /* glsl */ `
#ifdef PIXELSNAP
uniform vec4 screen_size;
#endif
#ifdef SCREENSPACE
uniform float projectionFlipY;
#endif
uniform float uWindTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uWindGust;
uniform float uWindHeight;   // この物の高さ（m）：しなりの量を高さで割って、大きさによらずそろえる
uniform float uWindBend;     // てっぺんがどれだけ動くか（高さに対する割合）
uniform float uWindFlutter;  // そよぎの大きさ（m）

vec4 evalWorldPosition(vec3 vertexPosition, mat4 modelMatrix) {
	vec3 localPos = getLocalPosition(vertexPosition);
	vec4 posW = modelMatrix * vec4(localPos, 1.0);

	vec3 base = modelMatrix[3].xyz;                       // その木（草）の根元の位置
	float h = clamp(localPos.y / uWindHeight, 0.0, 1.5);  // 根元 0 〜 てっぺん 1
	float phase = dot(base.xz, vec2(0.071, 0.113));
	float t = uWindTime;

	// しなり：ゆっくりした揺れ 2 つと突風
	float sway = sin(t * 0.83 + phase) * 0.55 + sin(t * 1.61 + phase * 1.7) * 0.25 + uWindGust;
	float bend = h * h * uWindHeight * uWindBend * uWindStrength;
	posW.xz += uWindDir * sway * bend;
	posW.y -= abs(sway) * bend * 0.12 * h;               // 傾いた分だけ少し下がる（長さを保つ）

	// そよぎ：場所ごとに違う、速い小さな揺れ
	float f = sin(t * 5.3 + dot(posW.xyz, vec3(1.9, 1.3, 2.3))) + sin(t * 7.9 + dot(posW.xyz, vec3(-1.1, 2.7, 0.9))) * 0.5;
	posW.xyz += vec3(uWindDir.x, 0.35, uWindDir.y) * f * uWindFlutter * h * (0.6 + uWindGust) * uWindStrength;

	#ifdef SCREENSPACE
		posW.zw = vec2(0.0, 1.0);
	#endif
	return posW;
}
vec4 getPosition() {
	dModelMatrix = getModelMatrix();
	vec4 posW = evalWorldPosition(vertex_position.xyz, dModelMatrix);
	dPositionW = posW.xyz;
	vec4 screenPos;
	#ifdef UV1LAYOUT
		screenPos = vec4(vertex_texCoord1.xy * 2.0 - 1.0, 0.5, 1);
		#ifdef WEBGPU
			screenPos.y *= -1.0;
		#endif
	#else
		#ifdef SCREENSPACE
			screenPos = posW;
			screenPos.y *= projectionFlipY;
		#else
			screenPos = matrix_viewProjection * posW;
		#endif
		#ifdef PIXELSNAP
			screenPos.xy = (screenPos.xy * 0.5) + 0.5;
			screenPos.xy *= screen_size.xy;
			screenPos.xy = floor(screenPos.xy);
			screenPos.xy *= screen_size.zw;
			screenPos.xy = (screenPos.xy * 2.0) - 1.0;
		#endif
	#endif
	return screenPos;
}
vec3 getWorldPosition() {
	return dPositionW;
}
`;

/**
 * マテリアルを風で揺れるようにする
 * @param {pc.StandardMaterial} material
 * @param {{height: number, bend: number, flutter: number}} opt
 *   height：物の高さ（m）、bend：てっぺんの揺れ幅（高さに対する割合）、flutter：そよぎの大きさ（m）
 */
export function applyWind(material, { height, bend, flutter }) {
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('transformVS', WIND_TRANSFORM_VS);
  material.setParameter('uWindHeight', height);
  material.setParameter('uWindBend', bend);
  material.setParameter('uWindFlutter', flutter);
  material.update();
}

/** 風の時刻・向き・突風を、毎フレーム全部のシェーダーに渡す */
export function createWind(app, config) {
  const w = config.wind;
  const scope = app.graphicsDevice.scope;
  const uTime = scope.resolve('uWindTime');
  const uDir = scope.resolve('uWindDir');
  const uStrength = scope.resolve('uWindStrength');
  const uGust = scope.resolve('uWindGust');
  const rad = (w.direction * Math.PI) / 180;
  const dir = new Float32Array([Math.cos(rad), Math.sin(rad)]);

  let time = 0, gust = 0, gustTarget = 0, gustTimer = 0;
  // 起動直後の最初の描画で値が無いと困るので、先に入れておく
  uTime.setValue(0); uDir.setValue(dir); uStrength.setValue(w.strength); uGust.setValue(0);

  return {
    update(dt) {
      time += dt;
      // 突風：数秒ごとに次の強さを決め、そこへなめらかに近づける
      gustTimer -= dt;
      if (gustTimer <= 0) {
        gustTimer = 2 + Math.random() * 5;
        gustTarget = Math.random() < 0.35 ? w.gust * (0.5 + Math.random() * 0.5) : 0;
      }
      gust += (gustTarget - gust) * Math.min(1, dt * 0.8);
      uTime.setValue(time);
      uDir.setValue(dir);
      uStrength.setValue(w.strength);
      uGust.setValue(gust);
    },
  };
}
