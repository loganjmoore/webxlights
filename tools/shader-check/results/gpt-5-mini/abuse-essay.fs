/*{
  "DESCRIPTION": "stylized columns and embers suggesting the fall of Rome",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.64, 0.12, 0.02, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.00, 0.48, 0.06, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.00, 0.90, 0.30, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 10.0, "DEFAULT": 3.0 },
    { "NAME": "crumble", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
float hash1(float n) {
  return fract(sin(n) * 43758.5453);
}
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  // If the canvas is very short (a roofline), drive animation along x
  bool narrow = (RENDERSIZE.y < 2.0);
  // Primary coordinate for banding and motion
  float u = narrow ? uv.x : uv.x;
  // Tweakable parameters
  float s = max(scale, 0.1);
  float t = TIME * speed * 0.25;
  // Column space
  float xpos = u * s;
  float col = floor(xpos);
  float fx = fract(xpos) - 0.5; // -0.5 .. 0.5 inside a column
  // Per-column seeds
  float seed = hash1(col * 1.2345);
  // Periodic "decay" of each column's top, continuous and loopable
  float period = 1.0 + seed * 2.0;
  float phase = sin(t * (1.0 / period) * 6.28318 + seed * 6.28318 + col * 0.21);
  // Base height of a column top (0..1)
  float h = 0.35 + 0.45 * (0.5 + 0.5 * phase);
  // Tilt/lean as it collapses, scaled by crumble
  float tilt = sin(t * 0.8 + seed * 2.0) * 0.25 * crumble;
  float top = clamp(h + fx * tilt, 0.0, 1.0);
  // Column interior mask: 1 inside column below top, 0 outside
  float inside = 1.0 - step(top, uv.y);
  // Grain/variation inside the stone
  float grain = hash2(vec2(col, floor(uv.y * 40.0 + t * 6.0))) * 0.6 + 0.4;
  // Cracks: sparse thin dark lines driven by vertical position and crumble
  float crackSeed = hash2(vec2(col * 1.7, uv.y * 80.0));
  float crackMask = step(crackSeed, 0.06 + 0.04 * crumble);
  // Darken where cracks exist
  float crackDark = crackMask * 0.85 * crumble;
  // Ember glow around the top and drifting sparks
  float glow = exp(-pow((uv.y - top) * 25.0, 2.0)) * (0.35 + 0.65 * abs(sin(TIME * 6.0 + seed * 6.28318)));
  // Small flickering sparks using a fast seed-based pulse
  float sparkSeed = hash2(vec2(col * 5.3, floor(uv.y * 60.0) + floor(TIME * 8.0)));
  float sparks = smoothstep(0.98, 1.0, sparkSeed) * (0.6 + 0.4 * sin(TIME * 30.0 + seed * 6.28318));
  // Base column color mixes the stone (colorA) with hot embers (colorB) by seed
  vec3 baseColor = mix(colorA.rgb, colorB.rgb, hash1(col * 4.56) * 0.6 + 0.2);
  // Apply grain and cracks
  vec3 colColor = baseColor * (0.5 + 0.5 * grain) * (1.0 - crackDark);
  // Add ember glow and sparks (colorC bright)
  vec3 emberColor = colorC.rgb * (glow * 1.2 + sparks * 1.5);
  // Compose final color: background black, columns, ember highlights
  vec3 color = vec3(0.0, 0.0, 0.0);
  color = mix(color, colColor, inside);
  // Ember highlights only above and near tops and within columns' vicinity
  color += emberColor * (inside * 0.8 + smoothstep(0.0, 0.15, glow) * 0.6);
  // Add subtle rim light on edges of columns to suggest broken stone
  float edge = smoothstep(0.22, 0.18, abs(fx)) * inside * 0.25;
  color += colorB.rgb * edge;
  // Boost contrast for night display
  color = pow(color, vec3(0.95));
  gl_FragColor = vec4(color, 1.0);
}
