/*{
  "DESCRIPTION": "fire rising from the bottom",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.5, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.4, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.6, 0.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.1, "MAX": 10.0, "DEFAULT": 1.5 },
    { "NAME": "flameHeight", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.8 },
    { "NAME": "turbulence", "TYPE": "float", "MIN": 0.0, "MAX": 2.0, "DEFAULT": 0.8 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  // drive vertical axis; if the buffer is one-pixel tall, use x as the vertical axis
  float v = (RENDERSIZE.y < 2.0) ? uv.x : uv.y;
  float x = uv.x;

  // safe minimums to avoid division by zero
  float safeHeight = max(flameHeight, 0.01);
  float safeScale = max(scale, 0.01);

  // animated time
  float t = TIME * max(speed, 0.0);

  // multi-octave sine "fbm" turbulence along the horizontal axis
  float tsum = 0.0;
  float wsum = 0.0;
  for (int i = 1; i <= 4; i++) {
    float fi = pow(2.0, float(i));
    float w = 1.0 / fi;
    float phase = t * (0.4 + 0.1 * float(i));
    float off = v * (1.5 + 0.2 * float(i));
    tsum += sin((x * fi * safeScale * 6.28318) + phase + off) * w;
    wsum += w;
  }
  float turb = tsum / max(wsum, 0.0001); // -1..1
  turb = 0.5 + 0.5 * turb; // 0..1

  // horizontal spread gets narrower higher up
  float baseSpread = mix(0.22 * safeScale, 0.06 * safeScale, v);
  baseSpread = max(baseSpread, 0.005);

  // distance from center, account for aspect so wide displays look correct
  float dx = abs((x - 0.5) * aspect);
  float dnorm = dx / baseSpread;

  // horizontal mask: 1.0 at center, falls to 0 at edges
  float hmask = smoothstep(1.05, 0.0, dnorm);

  // vertical falloff controlled by flameHeight, with a soft top
  float vnorm = v / safeHeight;
  float vmask = clamp(1.0 - vnorm, 0.0, 1.0);

  // add flicker and turbulence influence
  float flick = 0.85 + 0.35 * sin(t * 3.0 + v * 10.0);
  float turbInfluence = mix(1.0, turb, min(turbulence, 2.0));
  float intensity = vmask * hmask * flick * turbInfluence;
  intensity = clamp(intensity, 0.0, 1.0);

  // color layering: outer (colorC) -> mid (colorB) -> core (colorA)
  vec3 colOuter = colorC.rgb;
  vec3 colMid = colorB.rgb;
  vec3 colCore = colorA.rgb;

  // smooth thresholds for color blending
  float midBlend = smoothstep(0.05, 0.65, intensity);
  float coreBlend = smoothstep(0.6, 1.0, intensity);

  vec3 baseCol = mix(colOuter, colMid, midBlend);
  vec3 finalCol = mix(baseCol, colCore, coreBlend);

  // add a soft additive glow based on intensity to simulate bright core
  vec3 glow = colCore * pow(intensity, 0.6) * 1.2;

  // slight upward motion streak: make brighter streaks that move up continuously
  float streak = smoothstep(0.0, 1.0, sin((v * 8.0 - t * 1.5) + turb * 6.28) * 0.5 + 0.5);
  finalCol += glow * (0.25 * streak);

  // final mix and clamp for high contrast and saturated look
  vec3 outColor = clamp(finalCol + glow * 0.2, 0.0, 1.0);

  gl_FragColor = vec4(outColor, 1.0);
}
