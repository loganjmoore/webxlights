/*{
  "DESCRIPTION": "Ten-language Merry Christmas bands cycling across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.2, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "fill", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0. nine },
    { "NAME": "glow", "TYPE": "float", "MIN": 0.0, "MAX": 3.0, "DEFAULT": 1.0 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // Orientation: if very short vertically (a roofline), drive along X instead of Y
  float axisPos = (RENDERSIZE.y < 2.0) ? uv.x : uv.y;

  const int LANGS = 10;
  float bands = float(LANGS);
  // safe speed (avoid divide by zero)
  float sp = max(speed, 0.01);

  // Band sizing
  float baseBandWidth = (1.0 / bands);
  float bandWidth = baseBandWidth * clamp(fill, 0.1, 1.0);

  // Time-based periodic phase to keep animation seamless
  float twoPi = 6.2831853;
  // period scales with speed so user can slow/speed the loop
  float period = 8.0 / sp;
  float angleBase = TIME * twoPi / period;

  vec3 outCol = vec3(0.0);
  float accum = 0.0;

  for (int i = 0; i < LANGS; i++) {
    float fi = float(i);
    float center = (fi + 0.5) / bands;

    // Soft-edged band mask
    float d = abs(axisPos - center);
    float half = bandWidth * 0.5;
    float edge = half * 0.5;
    // 1.0 at center, 0.0 outside half+edge
    float mask = 1.0 - smoothstep(half, half + edge, d);

    // Choose a base color per band by blending the three palette inputs
    float t = fi / (bands - 1.0);
    // use a small sinusoidal variation so neighbours differ nicely
    float wobble = 0.5 + 0.5 * sin(fi * 0.7 + angleBase * 0.5);
    float s0 = smoothstep(0.0, 1.0, t * 1.0);
    vec3 base = mix(mix(colorA.rgb, colorB.rgb, s0), colorC.rgb, wobble * 0.5);

    // Per-band pulsing that travels across language indices, but is periodic (seamless)
    float bandPhase = angleBase * 0.9 + fi * 0.63;
    float pulse = 0.5 + 0.5 * sin(bandPhase);
    // A moving highlight that sweeps along the band positions (gives translation feel)
    float sweep = 0.5 + 0.5 * sin(angleBase + fi * 0.5);

    // Intensity shaped by mask, pulse, and user glow
    float intensity = mask * (0.35 + 1.2 * pulse * sweep) * glow;

    // Additive layering so overlapping soft edges brighten naturally
    outCol += base * intensity;
    accum += intensity;
  }

  // Normalize brightness to avoid clipping, favor saturated colors
  float norm = max(accum, 1.0);
  vec3 finalColor = outCol / norm;

  // Boost contrast and saturation a bit for night viewing
  float satBoost = 1.15;
  // simple saturation: lerp gray to color
  float lum = dot(finalColor, vec3(0.299, 0.587, 0.114));
  finalColor = mix(vec3(lum), finalColor, satBoost);

  // Slight global pulse driven by time for cohesive breathing
  float globalPulse = 0.9 + 0.1 * sin(TIME * sp * 1.23);
  finalColor *= globalPulse;

  gl_FragColor = vec4(finalColor, 1.0);
}
