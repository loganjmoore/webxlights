/*{
  "DESCRIPTION": "green streaks falling like digital rain",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.0, "MAX": 8.0, "DEFAULT": 3.0 },
    { "NAME": "streakWidth", "TYPE": "float", "MIN": 0.001, "MAX": 0.2, "DEFAULT": 0.02 }
  ]
}*/
float hashf(float n) {
  return fract(sin(n) * 43758.5453);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  // choose main axis: normally vertical (y). On very short buffers, drive along x so rooflines show motion.
  float axis = uv.y;
  float orth = uv.x;
  if (RENDERSIZE.y < 2.0) {
    axis = uv.x;
    orth = uv.y;
  }

  float spd = max(0.0, speed);
  float dens = max(0.0, density);
  float wBase = max(0.0001, streakWidth);

  // accumulate contributions from a fixed set of procedural streak generators
  float accum = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    // horizontal placement with density affecting effective tiling
    float pseed = hashf(fi * 1.371 + 0.17);
    float xpos = fract(pseed * (1.0 + dens * 0.18));

    // per-streak speed and length variation
    float sseed = hashf(fi * 2.719 + 3.14);
    float speedVar = 0.25 + hashf(fi * 4.11 + 1.0) * 1.75;
    float tpos = fract(TIME * spd * speedVar + sseed);

    float len = clamp(0.05 + hashf(fi * 5.3 + 2.2) * 0.45 + dens * 0.02, 0.02, 0.9);

    // distance from streak head along axis (wrap-around)
    float dist = fract(axis - tpos + 1.0); // 0.0 at head, increases downward
    // vertical brightness profile: head brightest, fading along length
    float v = max(0.0, 1.0 - dist / max(0.001, len));
    // stronger falloff for longer lengths for nicer tails
    float headShape = pow(v, 1.0 + 0.8 * (1.0 - len));

    // lateral falloff
    float dx = abs(orth - xpos);
    dx = min(dx, 1.0 - dx); // wrap around distance
    float w = wBase * (0.6 + dens * 0.12);
    float lateral = 1.0 - smoothstep(0.0, max(0.0001, w), dx);

    // subtle flicker / digital pixelation per streak and along its length
    float flickSeed = hashf(fi * 7.9 + floor(TIME * (0.5 + speedVar)) * 0.719);
    float flick = 0.7 + 0.6 * flickSeed;
    // lengthwise digital segmentation to suggest falling characters
    float seg = fract(dist * (10.0 + dens * 6.0) + hashf(fi + 9.3));
    float segMask = smoothstep(0.0, 0.6, seg);

    float contrib = headShape * lateral * mix(0.9, 1.3, flick) * segMask;
    accum += contrib;
  }

  // normalize and amplify with density
  accum = accum / 12.0;
  accum = pow(clamp(accum * (1.0 + dens * 0.12), 0.0, 1.0), 0.6);

  // color: streaks are colorB over a dark colorA; boost saturation and brightness for night visibility
  vec3 streakTint = colorB.rgb * (1.0 + 0.6 * accum);
  vec3 base = colorA.rgb;
  vec3 col = mix(base, streakTint, clamp(accum, 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
