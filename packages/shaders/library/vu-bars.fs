/*{
  "DESCRIPTION": "A row of VU meter bars bouncing up and down at different heights",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 1.0, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.1, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bars", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 }
  ]
}*/
float hash(float n) {
  return fract(sin(n * 91.7) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float t = mod(TIME * speed, 62.831853);
  float level;
  float along;
  float seam = 1.0;
  if (isLine) {
    // A line is one bar, filling from the left.
    level = 0.45 + 0.45 * (0.5 + 0.5 * sin(t * 2.1)) * (0.5 + 0.5 * sin(t * 0.7 + 1.0));
    along = uv.x;
  } else {
    // Never narrower than three pixels a bar, or a seam would swallow the bar itself.
    float n = min(bars, max(1.0, floor(RENDERSIZE.x / 3.0)));
    float bar = floor(uv.x * n);
    float h = hash(bar);
    // Each bar bounces at its own pair of rates, all whole tenths so the wrap is seamless.
    float rate = 1.5 + 0.5 * floor(h * 4.0);
    float bounce = 0.5 + 0.5 * sin(t * rate + h * 6.28);
    float slow = 0.6 + 0.4 * sin(t * 0.3 + h * 3.0);
    level = 0.25 + 0.7 * bounce * slow;
    along = uv.y;
    // A dark seam between bars, so they read as bars.
    float fx = fract(uv.x * n);
    float aa = min(0.3, 1.2 * n / max(RENDERSIZE.x, 8.0));
    seam = smoothstep(0.0, aa, fx) * smoothstep(1.0, 1.0 - aa, fx);
  }
  float lit = step(along, level);
  // Green below, gold through the middle, red at the top: flat zones, like the real meter.
  vec3 col = colorA.rgb;
  col = mix(col, colorB.rgb, step(0.5, along));
  col = mix(col, colorC.rgb, step(0.8, along));
  // The unlit part of a bar is a dim ghost, so the meter's full scale is always visible.
  gl_FragColor = vec4(col * (0.12 + 0.88 * lit) * seam, 1.0);
}
