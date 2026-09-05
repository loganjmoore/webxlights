/*{
  "DESCRIPTION": "Soft clouds drifting slowly across a coloured sky, always well lit",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.55, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "cover", "TYPE": "float", "MIN": 0.2, "MAX": 0.8, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float t = mod(TIME * speed, 62.831853);
  // Clouds drift left to right. Three octaves of sines, all whole tenths, so the wrap is seamless.
  float x = uv.x * min(aspect, 3.0) * 3.0 - t * 0.3;
  float y = isLine ? 0.5 : uv.y * 3.0;
  float n = sin(x * 1.1 + sin(y * 1.3) * 1.2) * 0.5;
  n += sin(x * 2.3 + y * 1.7 + t * 0.1) * 0.3;
  n += sin(x * 4.1 - y * 2.9 - t * 0.2) * 0.2;
  n = 0.5 + 0.5 * n;
  // Cloud where the field is high: a soft but definite edge, and a brighter top to each cloud.
  float cloud = smoothstep(1.0 - cover - 0.12, 1.0 - cover + 0.12, n);
  float top = smoothstep(1.0 - cover + 0.15, 1.0 - cover + 0.35, n);
  vec3 col = colorA.rgb * 0.75;
  col = mix(col, colorB.rgb * 0.85, cloud);
  col = mix(col, colorB.rgb, top);
  gl_FragColor = vec4(col, 1.0);
}
