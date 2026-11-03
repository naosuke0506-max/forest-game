// 地面の質感を 3 枚混ぜる：土（今までの forrest_ground_01）・草地（aerial_grass_rock）・落ち葉と苔（forest_leaves_02）。
// 混ぜる割合は、地面の頂点色のアルファ（a）に入れておく：
//   a = 0.5 → 土だけ、a = 1 → 草地だけ、a = 0 → 落ち葉と苔だけ（草地と落ち葉は同じ所では混ぜない）
// エンジンの「色を決める部分」（diffusePS の getAlbedo）を差し替える。頂点色の RGB は今までどおり色味の調整（掛け算）
// 草地と落ち葉の画像は起動の後に裏で読む。届くまでは土の画像で代わりにする（見た目は今までと同じ）
import * as pc from 'playcanvas';

const GROUND_DIFFUSE_PS = /* glsl */ `
uniform vec3 material_diffuse;
uniform sampler2D texture_grassMap;
uniform sampler2D texture_litterMap;
uniform vec2 uGroundScale;   // 土の UV に掛ける倍率（x：草地、y：落ち葉）
void getAlbedo() {
	dAlbedo = material_diffuse.rgb;
	#ifdef STD_DIFFUSE_TEXTURE
		vec2 uv = {STD_DIFFUSE_TEXTURE_UV};
		vec3 soil = {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, uv, {STD_TEXTURE_BIAS})).rgb;
		vec3 grass = texture2DBias(texture_grassMap, uv * uGroundScale.x, {STD_TEXTURE_BIAS}).rgb;
		vec3 litter = texture2DBias(texture_litterMap, uv * uGroundScale.y, {STD_TEXTURE_BIAS}).rgb;
		float w = vVertexColor.a * 2.0 - 1.0;
		vec3 albedo = mix(soil, grass, clamp(w, 0.0, 1.0));
		albedo = mix(albedo, litter, clamp(-w, 0.0, 1.0));
		dAlbedo *= albedo;
	#endif
	#ifdef STD_DIFFUSE_VERTEX
		dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
	#endif
}
`;

/**
 * @param {pc.StandardMaterial} material 地面のマテリアル（diffuseMap に土の画像、diffuseVertexColor が有効）
 * @param {number} soilTile 土の画像 1 枚の大きさ（m）
 * @returns {{ setTextures(grass: pc.Texture|null, litter: pc.Texture|null): void }}
 */
export function applyGroundBlend(material, soilTile, { grassTile = 10, litterTile = 3 } = {}) {
  material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('diffusePS', GROUND_DIFFUSE_PS);
  material.setParameter('uGroundScale', [soilTile / grassTile, soilTile / litterTile]);
  // 届くまでは土の画像で代わりにする
  material.setParameter('texture_grassMap', material.diffuseMap);
  material.setParameter('texture_litterMap', material.diffuseMap);
  material.update();
  return {
    setTextures(grass, litter) {
      if (grass) material.setParameter('texture_grassMap', grass);
      if (litter) material.setParameter('texture_litterMap', litter);
    },
  };
}
