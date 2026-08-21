/*{
  "DESCRIPTION": "Aurora borealis curtains of flowing light",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 0.8, 0.3, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.2, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.6, 0.0, 0.9, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "curtains", "TYPE": "long", "MIN": 1, "MAX": 12, "DEFAULT": 6 },
    { "NAME": "scale", "TYPE": "float", "MIN": 0.2, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.0, "MAX": 1.0, "DEFAULT": 0.5 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  // choose motion axis: normally vertical curtains (vary along y), but for 1-pixel tall buffers use x
  bool thin = (RENDERSIZE.y < 2.0);
  float major = thin ? uv.x : uv.y;   // position along the curtain (motion direction)
  float minor = thin ? uv.y : uv.x;   // cross-curtain axis (width)
  float t = TIME * speed;
  int maxIter = 12;
  float curtainsF = max(1.0, float(curtains));
  // parameters controlling look
  float globalScale = max(0.001, scale);
  float soft = clamp(softness, 0.0, 1.0);
  vec3 accum = vec3(0.0);
  // base frequency for vertical waviness
  float waveFreq = 1.0 + 0.6 * globalScale;
  // loop over possible curtain ribbons (constant bound)
  for (int i = 0; i < 12; i++) {
    if (i >= curtains) {
      continue;
    }
    // center of this ribbon, tiled across 0..1
    float idx = float(i);
    float center = (idx + 0.5) / curtainsF;
    // local coordinate across ribbon, wrapped so ribbons tile naturally
    float local = fract(minor * curtainsF) ; // 0..1 across each ribbon cell
    float dx = abs(local - 0.5); // distance from center of ribbon cell (0..0.5)
    // ribbon width scaled by user scale
    float baseWidth = 0.22 / globalScale; // nominal half-width
    // apply softness to edges
    float edge0 = baseWidth * (1.0 - 0.6 * soft);
    float edge1 = baseWidth * (1.0 + 0.6 * soft);
    float band = 1.0 - smoothstep(edge0, edge1, dx);
    // vertical waviness / flowing curtains
    float phase = t * (0.4 + 0.6 * float(i) / curtainsF) + idx * 1.17;
    float w = sin((major * 6.28318 * waveFreq) + phase) * 0.5 + 0.5; // 0..1
    // make brighter crests and softer troughs
    float waveMask = pow(w, 0.6 + 0.8 * (1.0 - soft));
    // slight horizontal drift per ribbon to simulate folds
    float drift = sin(major * 6.28318 * (0.5 + 0.1 * float(i)) + phase * 0.7) * 0.08;
    // color blend across the curtain using major position and wave
    float colorBlend = smoothstep(0.0, 1.0, major * (1.0 + 0.2 * sin(phase * 0.6)) + drift);
    vec3 c1 = colorA.rgb;
    vec3 c2 = colorB.rgb;
    vec3 c3 = colorC.rgb;
    vec3 col = mix(c1, c2, colorBlend);
    col = mix(col, c3, smoothstep(0.15, 0.85, w));
    // intensity and soft glow
    float intensity = band * (0.5 + 1.0 * waveMask);
    // add a subtle vertical halo based on distance from center to soften look
    float halo = exp(-12.0 * dx * dx / max(0.0001, baseWidth * baseWidth)) * (0.3 + 0.7 * waveMask);
    accum += col * intensity + col * halo * 0.15;
  }
  // global contrast and clamp
  vec3 color = clamp(accum, vec3(0.0), vec3(1.0));
  // boost saturation for night display
  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 sat = mix(vec3(lum), color, 1.2);
  gl_FragColor = vec4(sat, 1.0);
}
