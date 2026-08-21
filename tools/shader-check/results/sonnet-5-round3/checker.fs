/*{
  "DESCRIPTION": "A two colour checkerboard pattern sliding sideways",
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

  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float slide = TIME * speed * 0.5;

  float cellsX = scale;
  float cellsY = RENDERSIZE.y < 2.0 ? 1.0 : max(scale / max(aspect, 0.0001), 1.0);

  float gx = floor(uv.x * cellsX - slide);
  float gy = floor(uv.y * cellsY);

  float checker = mod(gx + gy, 2.0);

  vec3 col = mix(colorA.rgb, colorB.rgb, checker);
  gl_FragColor = vec4(col, 1.0);
}
