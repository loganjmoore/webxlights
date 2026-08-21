/*{
  "DESCRIPTION": "A two colour checkerboard that slides sideways",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 6.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float isFlat = step(RENDERSIZE.y, 1.5);

  float cellsX = scale;
  float cellsY = mix(max(scale / max(aspect, 1.0), 1.0), cellsX, isFlat);

  float slide = TIME * speed * 0.5;

  float cx = floor(uv.x * cellsX + slide);
  float cy = floor(uv.y * cellsY);

  float checker = mod(cx + cy, 2.0);

  gl_FragColor = vec4(mix(colorA.rgb, colorB.rgb, checker), 1.0);
}
