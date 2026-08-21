/*{
  "DESCRIPTION": "Swirling plasma blend of colours across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 6.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;

  float t = TIME * speed;

  vec2 p;
  if (isLine) {
    p = vec2(uv.x * scale, t * 0.3);
  } else {
    p = uv * scale;
  }

  float x = p.x;
  float y = isLine ? p.y : p.y;

  float v = 0.0;
  v += sin(x * 3.0 + t);
  v += sin((y * 3.0 + t * 0.7) * 1.3);
  v += sin((x + y) * 2.0 + t * 1.1);

  float cx = x + 0.5 * sin(t * 0.3);
  float cy = y + 0.5 * cos(t * 0.25);
  v += sin(sqrt(cx * cx + cy * cy + 1.0) * 4.0 - t * 1.5);

  v *= 0.25;
  v = v * 0.5 + 0.5;

  vec3 col;
  float third = 1.0 / 3.0;
  if (v < third) {
    col = mix(colorA.rgb, colorB.rgb, v / third);
  } else if (v < 2.0 * third) {
    col = mix(colorB.rgb, colorC.rgb, (v - third) / third);
  } else {
    col = mix(colorC.rgb, colorA.rgb, (v - 2.0 * third) / third);
  }

  gl_FragColor = vec4(col, 1.0);
}
