/*{
  "DESCRIPTION": "A stylized American flag waving",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.750, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.125, 0.5, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "waveAmp", "TYPE": "float", "MIN": 0.0, "MAX": 0.2, "DEFAULT": 0.035 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // If the canvas is a roofline (very short), drive the vertical animation along x
  if (RENDERSIZE.y < 2.0) {
    uv.y = isf_FragNormCoord.x;
  }

  // Flag geometry constants (normalized to full canvas = 1.0 height)
  float stripes = 13.0;
  float cantonW = 0.40; // union width as fraction of flag length
  float cantonH = 7.0 / 13.0; // union height as fraction of flag height

  // Waving: multiple harmonics for a pleasing continuous motion
  float TWO_PI = 6.283185;
  float freq = 1.25;
  float t = TIME * speed;
  float wave = sin((uv.x) * freq * TWO_PI + t) * waveAmp
             + 0.5 * sin((uv.x) * (freq * 2.0) * TWO_PI + t * 0.7) * (waveAmp * 0.6);

  // Apply vertical displacement to produce wavy horizontal stripes
  vec2 v = uv;
  v.y += wave;

  // Keep v.y within 0..1 so stripes wrap neatly and don't sample outside
  v.y = clamp(v.y, 0.0, 1.0);

  // Determine stripe color: top stripe should be red (colorA)
  float sIndex = floor(v.y * stripes);
  float parity = mod(sIndex, 2.0);
  float isRed = 1.0 - parity; // 1.0 for red stripes, 0.0 for white
  vec3 stripeCol = mix(colorB.rgb, colorA.rgb, isRed);

  // Start with stripes as base
  vec3 col = stripeCol;

  // Canton (blue field) overlays stripes on the upper-left
  if (uv.x < cantonW && uv.y < cantonH) {
    // Base canton color (blue)
    col = colorC.rgb;

    // Compute local coordinates inside the canton [0..1]
    vec2 local = vec2(uv.x / cantonW, uv.y / cantonH);
    local = clamp(local, vec2(0.0), vec2(1.0));

    // Create a star grid approximating the 50-star pattern using alternating rows
    float rows = 9.0;
    float cols = 6.0;

    // Determine row index to offset every other row
    float rowIdx = floor(local.y * rows);
    float rowOffset = mod(rowIdx, 2.0) * 0.5 / cols;

    // Cell coordinates within the repeating grid
    vec2 cell = fract(vec2(local.x * cols + rowOffset, local.y * rows));
    vec2 d = cell - vec2(0.5);

    // Star shape by distance to cell center
    float starRadius = 0.22;
    float aa = 0.04;
    float dist = length(d);
    float star = 1.0 - smoothstep(starRadius - aa, starRadius + aa, dist);

    // Slightly boost some stars for variety using a secondary finer grid
    vec2 cell2 = fract(vec2(local.x * 5.0 + 0.25, local.y * 9.0));
    vec2 d2 = cell2 - vec2(0.5);
    float star2 = 1.0 - smoothstep(0.20 - 0.03, 0.20 + 0.03, length(d2));

    float starsMask = clamp(max(star, star2), 0.0, 1.0);

    // Overlay white stars (colorB) onto the canton
    col = mix(col, colorB.rgb, starsMask);
  }

  // Slight bloom along stripe crests for richer look (subtle lighting)
  float light = clamp(0.5 + 0.5 * sin((uv.x * 3.0 * TWO_PI) + t * 0.7), 0.0, 1.0);
  float highlight = 0.06 * light;
  col += highlight * (isRed * 0.6 + (1.0 - isRed) * 0.2);

  gl_FragColor = vec4(col, 1.0);
}
