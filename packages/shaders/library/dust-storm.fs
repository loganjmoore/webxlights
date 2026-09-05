/*{
  "DESCRIPTION": "A wall of dust rolling past, warm and grainy but never a still image",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.65, 0.25, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.6, 0.2, 0.05, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "grain", "TYPE": "float", "MIN": 0.0, "MAX": 0.6, "DEFAULT": 0.3 }
  ]
}*/
float hash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  float t = mod(TIME * speed, 62.831853);
  // The wall rolls fast from right to left: big billows, made of sines at whole tenths so the
  // wrap is seamless, with a slower churn inside them.
  float x = uv.x * min(aspect, 3.0) * 2.0 + t * 1.5;
  float y = isLine ? 0.3 : uv.y * 2.0;
  float billow = sin(x * 1.3 + sin(y * 1.7 - t * 0.6) * 1.2) * 0.5 + sin(x * 2.7 - y * 1.1 + t * 0.9) * 0.3 + sin(y * 3.1 + x * 0.6 - t * 0.4) * 0.2;
  billow = 0.5 + 0.5 * billow;
  // Grain: the dust itself, a per-bulb flicker that changes a few times a second. The hash
  // takes a stepped time, so it never loses precision.
  float tick = floor(mod(TIME * speed, 100.0) * 4.0);
  float g = hash(floor(uv * RENDERSIZE) + tick * 0.37);
  float dust = billow * (1.0 - grain) + g * grain;
  // Dense dust is lit warm by the sun behind it; thin dust shows the darker sky through.
  vec3 col = mix(colorB.rgb, colorA.rgb, smoothstep(0.3, 0.7, dust));
  float lit = 0.45 + 0.55 * dust;
  gl_FragColor = vec4(col * lit, 1.0);
}
