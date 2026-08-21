/*{
  "DESCRIPTION": "A slow breathing glow",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.20 },
    { "NAME": "count", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 3 },
    { "NAME": "size", "TYPE": "float", "MIN": 0.3, "MAX": 8.0, "DEFAULT": 2.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // Primary axis: use X so line displays and rooflines read correctly
  float axis = uv.x;
  // Time and global pulse (0..1) - slow, smooth, continuous
  float t = TIME * speed;
  float globalPulse = 0.5 + 0.5 * sin(t * 6.2831853);
  // Prepare count as an integer (clamped) and a float copy for math
  int icount = clamp(count, 1, 8);
  float fcount = float(icount);
  float sum = 0.0;
  // Accumulate small glowing nodes along the strand
  for (int i = 0; i < 8; i++) {
    if (i < icount) {
      float fi = float(i);
      // Evenly spaced base positions, with a gentle time-varying offset for life
      float basePos = (fi + 0.5) / fcount;
      float wiggle = 0.06 * sin(t * 0.6 + fi * 1.9);
      float pos = basePos + wiggle;
      // Distance with wrap-around for continuous strand
      float dist = axis - pos;
      float wrapped = abs(mod(dist + 0.5, 1.0) - 0.5);
      // Width scales with user size (prevent division by zero)
      float w = 0.18 / max(size, 0.001);
      float contribution = exp(- (wrapped * wrapped) / (w * w));
      sum += contribution;
    }
  }
  // Normalize and shape the contribution
  sum = clamp(sum, 0.0, 1.0);
  // Combine global breathing with local highlights for a pleasing glow
  float brightness = mix(0.25, 1.0, globalPulse) * (0.30 + 0.70 * sum);
  // Gentle color shift over time and along the axis for subtle variety
  float colorMix = 0.5 + 0.5 * sin(t * 0.35 + axis * 6.2831853);
  vec3 baseColor = mix(colorA.rgb, colorB.rgb, colorMix);
  vec3 finalCol = baseColor * brightness;
  gl_FragColor = vec4(finalCol, 1.0);
}
