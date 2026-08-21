/*{
  "DESCRIPTION": "Crumbling columns of color topple and rebuild in an endless falling-empire cycle",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.8, 0.1, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.9, 0.7, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "columns", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "sharpness", "TYPE": "float", "MIN": 0.05, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  float t = TIME * speed * 0.3;
  float cycle = fract(t * 0.15);

  float axis = isRoofline ? uv.x : uv.x;
  float colId = floor(axis * columns);
  float colFrac = fract(axis * columns);

  float rnd = fract(sin(colId * 12.9898) * 43758.5453);
  float fallPoint = fract(cycle + rnd);

  float height = isRoofline ? 0.5 : uv.y;

  float collapseLevel = fallPoint;
  bool standing = height < collapseLevel;

  float edge = smoothstep(0.0, sharpness, abs(colFrac - 0.5) * 2.0 - (1.0 - sharpness));
  float columnMask = 1.0 - edge;

  float flicker = 0.85 + 0.15 * sin(TIME * 3.0 + colId * 2.0);

  vec3 baseColor = mix(colorA.rgb, colorB.rgb, rnd);
  vec3 col = standing ? baseColor * flicker : mix(baseColor, vec3(0.05, 0.03, 0.02), 0.7);

  col *= mix(0.3, 1.0, columnMask);

  gl_FragColor = vec4(col, 1.0);
}
