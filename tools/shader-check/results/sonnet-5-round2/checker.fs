/*{
  "DESCRIPTION": "A two colour checkerboard that slides sideways",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 16.0, "DEFAULT": 6.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float aspect = max(RENDERSIZE.x / max(RENDERSIZE.y, 1.0), 1.0);
  bool flatBuffer = RENDERSIZE.y < 2.0;

  float cellsX = scale * aspect;
  float cellsY = flatBuffer ? cellsX : scale;

  float slide = TIME * speed * 0.5;

  float gx = floor(uv.x * cellsX + slide);
  float gy = flatBuffer ? 0.0 : floor(uv.y * cellsY);

  float checker = mod(gx + gy, 2.0);

  vec3 col = mix(colorA.rgb, colorB.rgb, checker);
  gl_FragColor = vec4(col, 1.0);
}
