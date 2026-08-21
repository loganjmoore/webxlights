/*{
  "DESCRIPTION": "Festive chocolate chip cookie lights with twinkling chips",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.82, 0.55, 0.31, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.08, 0.03, 0.00, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.02, 0.00, 0.08, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.2, "MAX": 8.0, "DEFAULT": 4.0 }
  ]
}*/
 
// Cookie grid with twinkling chocolate chips.
// Uses isf_FragNormCoord, TIME, RENDERSIZE, and user colors/speed/scale.

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 hash22(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1,311.7)), dot(p, vec2(269.5,183.3)))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  // If very short vertically (roofline), drive animation along x
  vec2 filmUV = uv;
  if (RENDERSIZE.y < 2.0) {
    filmUV = vec2(uv.x, 0.5);
  }
  // tiling for cookie grid
  float tiles = clamp(scale, 0.2, 16.0);
  vec2 gridPos = filmUV * tiles;
  vec2 id = floor(gridPos);        // cell id
  vec2 cell = fract(gridPos) - 0.5; // -0.5..0.5 local coords within cell

  // jitter each cookie center a bit for natural look, animate slightly with time
  vec2 jitter = (hash22(id) - 0.5) * 0.40;
  float jitterPhase = hash21(id) * 6.2831853;
  jitter += vec2(sin(TIME * speed + jitterPhase), cos(TIME * speed * 0.8 + jitterPhase)) * 0.03;

  vec2 local = cell - jitter;

  // cookie radius and edge softness scaled by tiles
  float baseRadius = 0.45;
  float radius = baseRadius * (1.0 - 0.04 * (tiles - 1.0));
  radius = max(radius, 0.20);
  float edgeSoft = 0.10 * (1.0 + 0.12 * (4.0 - clamp(tiles, 0.2, 8.0)));

  float dist = length(local);
  float cookieMask = 1.0 - smoothstep(radius - edgeSoft, radius + edgeSoft, dist);

  // subtle per-cookie tone variation
  float tone = mix(0.90, 1.12, hash21(id + vec2(0.0, 7.0)));
  vec3 cookieTone = clamp(colorA.rgb * tone, 0.0, 1.0);

  // base color blends cookie over background using the cookie mask
  vec3 col = mix(colorC.rgb, cookieTone, cookieMask);

  // Add a gentle baked shadow near edges for depth
  float rim = smoothstep(radius - edgeSoft * 1.6, radius, dist);
  col *= mix(1.02, 0.68, rim * 0.8 * cookieMask);

  // Chocolate chips: place up to 6 chips per cookie using small constant loop
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    // chip seed per cell and index
    vec2 seed = id + vec2(fi * 1.37, fi * 2.17);
    vec2 h = hash22(seed);
    // chip position relative to center, constrained inside cookie
    vec2 chipPos = (h - 0.5) * radius * 1.4;
    // nudge chips toward inside with another random factor
    float inward = mix(0.75, 1.0, hash21(seed + vec2(3.0,4.0)));
    chipPos *= inward;
    // animate slight wobble / twinkle per chip
    float tw = 0.5 + 0.5 * sin(TIME * speed * 3.0 + hash21(seed) * 6.2831853);
    float chipR = 0.055 + 0.020 * hash21(seed + vec2(5.0,6.0));
    float chipEdge = 0.012;
    float cd = length(local - chipPos);
    // chip only visible if inside cookie (multiply by cookieMask)
    float chipMask = (1.0 - smoothstep(chipR - chipEdge, chipR + chipEdge, cd)) * cookieMask;
    // chips are dark; mix towards chip color. Twinkle modulates intensity.
    float chipIntensity = 0.55 + 0.45 * tw;
    vec3 chipCol = mix(col, colorB.rgb * (0.7 + 0.3 * hash21(seed + vec2(9.0,1.0))), chipMask * chipIntensity);
    // composite: chips override where stronger
    col = mix(col, chipCol, chipMask);
  }

  // Slight overall subtle sparkle on cookie surface to feel warm and glossy
  float sparkle = pow(max(0.0, 1.0 - dist / radius), 3.0) * (0.12 + 0.08 * sin(TIME * speed * 1.6 + hash21(id) * 12.0));
  col += cookieMask * sparkle * vec3(1.0, 0.6, 0.35) * 0.25;

  // Ensure vivid, high-contrast night display (boost saturation)
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 sat = mix(vec3(lum), col, 1.15);
  col = clamp(sat, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
