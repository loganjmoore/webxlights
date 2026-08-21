/*{
  "DESCRIPTION": "warm candle flicker",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.85, 0.35, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 3.0, "DEFAULT": 1.0 },
    { "NAME": "flicker", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.7 }
  ]
}*/
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
float noise22(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i + vec2(0.0, 0.0));
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f * f * (vec2(3.0, 3.0) - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
void main() {
  vec2 uv = isf_FragNormCoord;
  float safeH = max(RENDERSIZE.y, 1.0);
  float aspect = RENDERSIZE.x / safeH;
  float isThin = (RENDERSIZE.y < 2.0) ? 1.0 : 0.0;

  // choose axis along which the flame rises: normally y, on very thin buffers use x
  float along = mix(uv.y, uv.x, isThin);
  // perpendicular coordinate (small across the flame)
  float perp = mix((uv.x - 0.5) * aspect * scale, (uv.y - 0.5) * aspect * scale, isThin);

  // time and noisy flicker
  float t = TIME * (0.8 + speed * 1.2);
  float nA = noise22(vec2(t * 0.9, 4.2));
  float nB = noise22(vec2(t * 2.3, 9.7));
  float pulse = 0.5 + 0.5 * sin(TIME * 6.0 * speed + hash12(vec2(TIME, 1.0)) * 6.28318);
  float flickNoise = mix(nA, nB, 0.5);
  float flickVal = mix(1.0 - 0.45 * flicker, 1.0 + 0.35 * flicker, pulse) * (0.85 + 0.3 * flickNoise);

  // flame geometry
  float flameHeight = clamp(0.22 * scale, 0.05, 0.9);
  float ynorm = clamp(along / flameHeight, 0.0, 1.0);

  // width shrinks upward; add subtle horizontal wobble from noise
  float wobble = 0.08 * noise22(vec2(along * 6.0, t * 0.7));
  float width = mix(0.28 + wobble, 0.03 + wobble * 0.2, ynorm) * scale;
  width = max(width, 0.001);

  // core shape: lateral falloff and vertical fade
  float d = abs(perp) / width;
  float core = 1.0 - clamp(d, 0.0, 1.0);
  float verticalFade = 1.0 - pow(ynorm, 1.6);
  float shape = core * verticalFade;

  // small upward bright tongues from faster noise
  float tongue = smoothstep(0.6, 0.0, fract(noise22(vec2(along * 10.0, t * 2.5)) + 0.5 * ynorm)) * 0.6;
  float brightness = (shape + 0.4 * tongue) * flickVal;
  brightness = clamp(brightness, 0.0, 1.6);

  // color blend from inner (colorA) to outer (colorB) with height influence
  float colorMixFactor = clamp(ynorm * 0.9 + (1.0 - core) * 0.3, 0.0, 1.0);
  vec3 flameCol = mix(colorA.rgb, colorB.rgb, colorMixFactor);

  // soft halo/glow around the flame
  float glow = exp(-abs(perp) * 10.0) * (0.7 + 0.7 * (1.0 - ynorm)) * flickVal;
  vec3 glowCol = mix(colorA.rgb * 0.8, colorB.rgb * 0.7, 0.7);

  vec3 outCol = flameCol * (brightness * 1.5) + glowCol * (glow * 0.9);

  // small ambient spill so it reads on dark backgrounds
  outCol += 0.02 * flickVal * colorB.rgb;

  outCol = clamp(outCol, vec3(0.0), vec3(1.0));
  gl_FragColor = vec4(outCol, 1.0);
}
