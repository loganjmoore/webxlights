/*{
  "DESCRIPTION": "Spooky green fog drifting",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.12, 1.00, 0.25, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.00, 0.00, 0.00, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 8.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.6 }
  ]
}*/
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (vec2(3.0, 3.0) - 2.0 * f);
  float a = hash21(i + vec2(0.0, 0.0));
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    v += amp * noise21(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return v;
}
void main() {
  vec2 uv = isf_FragNormCoord;
  // Drive main motion along X; if canvas is essentially a roofline, keep it readable along X.
  vec2 coord = uv;
  if (RENDERSIZE.y < 2.0) {
    // When very short vertically, map variation into X so it reads across the strand
    coord.y = uv.x;
  }
  // Feature scale and animated drift
  float s = max(scale, 0.1);
  vec2 p = (coord - vec2(0.5, 0.5)) * s * 3.0;
  // Primary horizontal drift
  p.x += TIME * (0.12 * speed);
  // Subtle vertical flow for layers
  p.y += TIME * 0.04;
  // Layered fog
  float base = fbm(p + vec2(0.0, 0.0));
  float layer = fbm(p * 1.7 + vec2(5.2, -3.1) + base * 2.0);
  float detail = fbm(p * 3.2 - vec2(2.3, 1.7));
  // Combine layers into a soft, moving density map
  float raw = mix(base, layer, 0.6) * 0.8 + detail * 0.2;
  // Make fog more concentrated toward mid tones and controlled by density slider
  float thresholdLow = 0.35 - density * 0.25;
  float thresholdHigh = 0.70 - density * 0.35;
  float fog = smoothstep(thresholdLow, thresholdHigh, raw);
  // Add wispy bands that drift with time for spooky movement
  float bands = 0.5 + 0.5 * sin((coord.y * 6.0 + raw * 4.0) - TIME * speed * 0.6);
  fog *= mix(0.8, 1.2, pow(bands, 1.8));
  fog = clamp(fog, 0.0, 1.0);
  // Color the fog: colorA is the eerie green, colorB is the dark background
  vec3 col = mix(colorB.rgb, colorA.rgb, pow(fog, 1.2));
  // Boost contrast for visibility on lights
  col *= mix(0.6, 1.6, fog);
  gl_FragColor = vec4(col, 1.0);
}
