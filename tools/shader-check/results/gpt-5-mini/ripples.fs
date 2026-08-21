/*{
  "DESCRIPTION": "raindrops making ripples",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.2, 0.6, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.5, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.5, "MAX": 8.0, "DEFAULT": 3.0 },
    { "NAME": "drops", "TYPE": "float", "MIN": 1.0, "MAX": 12.0, "DEFAULT": 6.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.1, "MAX": 2.0, "DEFAULT": 0.6 }
  ]
}*/
float hash1(float n) {
  return fract(sin(n) * 43758.5453123);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  vec3 bg = colorC.rgb;
  vec3 outCol = bg;

  // Safety for render size based arithmetic
  float rsx = max(RENDERSIZE.x, 1.0);
  float rsy = max(RENDERSIZE.y, 1.0);

  // Drive ripples along X for very short buffers (rooflines)
  bool isLine = (RENDERSIZE.y < 2.0);

  // Parameters
  float countF = max(1.0, drops);
  const int MAX_DROPS = 12;

  // Loop with constant bounds; only first int(countF) drops are active
  for (int i = 0; i < MAX_DROPS; i++) {
    if (i >= int(countF)) break;
    float fi = float(i);

    // Per-drop randomization
    float base = fi * 12.9898;
    float rx = hash1(base + 0.1234);
    float ry = hash1(base + 4.5678);
    float phase = hash1(base + 8.9012);

    // Period and radius scale per drop (avoid dividing by zero; speed >= 0.1)
    float period = mix(1.4, 3.6, hash1(base + 3.3333)) / speed;
    float maxRadiusNormalized = mix(0.12, 0.9, hash1(base + 6.7777)) * scale;

    // Map normalized radius to UV space taking render aspect into account
    // Use larger of dimensions so ripples look similar on narrow and wide buffers
    float diag = max(rsx, rsy);
    float maxRadius = maxRadiusNormalized * (diag > 0.0 ? (1.0 / diag) * min(rsx, rsy) : 1.0);

    // Compute this drop's repeating age (0..period)
    float startOffset = phase * period;
    float age = mod(TIME + startOffset, period);
    float nAge = age / period; // 0..1

    // Drop position in UV
    vec2 pos = vec2(rx, ry);

    // Distance: radial on 2D, absolute along X on 1D lines
    float dist;
    if (isLine) {
      dist = abs(uv.x - rx);
      // normalize distances for line to approximate screen-scale similar to 2D
      dist *= rsx / max(rsx, rsy);
    } else {
      dist = distance(uv, pos);
    }

    // Wave ring: outward moving radius
    float ringRadius = nAge * maxRadius;

    // Ring sharpness and decay
    float ringSharp = mix(8.0, 40.0, softness); // higher => thinner rings
    float decay = mix(1.5, 6.0, softness); // spatial decay

    // Ring shape (Gaussian-like) centered at distance == ringRadius
    float d = abs(dist - ringRadius);
    float ring = exp(- (d * ringSharp) * (d * ringSharp));

    // Age envelope: rings fade with time
    float ageEnv = pow(max(0.0, 1.0 - nAge), 1.2);

    // Central splash: bright short-lived core when age is small
    float core = 0.0;
    float coreRadius = maxRadius * 0.12;
    if (nAge < 0.25) {
      float c = smoothstep(coreRadius, 0.0, dist) * (1.0 - nAge * 4.0);
      core = c;
    }

    // Combine intensities and color mix
    float intensityRing = ring * ageEnv * (1.0 / max(1.0, decay * dist + 0.0001));
    float intensityCore = core * 1.6;

    // Color contributions: core uses colorA, ring uses colorB
    outCol += colorB.rgb * intensityRing * 1.6;
    outCol += colorA.rgb * intensityCore * 1.8;
  }

  // Slight glow and clamp
  outCol = clamp(outCol, 0.0, 1.0);

  gl_FragColor = vec4(outCol, 1.0);
}
