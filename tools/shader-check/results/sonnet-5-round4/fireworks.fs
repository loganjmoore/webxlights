/*{
  "DESCRIPTION": "Bursts of colored sparks explode outward like fireworks",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.6, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "count", "TYPE": "long", "MIN": 1, "MAX": 8, "DEFAULT": 5 }
  ]
}*/

float hash1(float n) {
  return fract(sin(n * 43758.5453) * 43758.5453);
}

void main() {
  bool isRoofline = RENDERSIZE.y < 2.0;
  vec2 uv = isf_FragNormCoord;

  vec3 col = vec3(0.02, 0.0, 0.05);

  for (int i = 0; i < 8; i++) {
    if (i >= int(count)) break;
    float fi = float(i);

    // stagger each burst's life cycle, looped continuously
    float cycle = 2.2;
    float offset = hash1(fi * 7.31) * cycle;
    float t = mod(TIME * speed + offset, cycle) / cycle;

    // burst origin, changes each loop
    float loopIndex = floor((TIME * speed + offset) / cycle);
    float cx = hash1(fi * 3.17 + loopIndex * 11.1) * 0.8 + 0.1;
    float cy = hash1(fi * 5.71 + loopIndex * 17.3) * 0.6 + 0.3;

    vec2 center = isRoofline ? vec2(cx, 0.5) : vec2(cx, cy);

    // expansion radius: fast out, fade at end
    float radius = t * 0.45;
    float fade = smoothstep(1.0, 0.6, t);

    // pick a color per burst
    vec3 burstColor = i % 3 == 0 ? colorA.rgb : (i % 3 == 1 ? colorB.rgb : colorC.rgb);

    const int SPARKS = 12;
    for (int s = 0; s < SPARKS; s++) {
      float fs = float(s);
      float ang = fs / float(SPARKS) * 6.28318 + hash1(fi * 13.0 + fs) * 0.3;
      vec2 dir = vec2(cos(ang), sin(ang));

      // account for roofline being 1D: squish y contribution
      vec2 sparkPos = center + dir * radius;
      if (isRoofline) {
        sparkPos.y = 0.5;
      }

      vec2 delta = uv - sparkPos;
      if (!isRoofline) {
        delta.y *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
      }
      float d = length(delta);

      float glow = smoothstep(0.05, 0.0, d) * fade;
      col += burstColor * glow;
    }

    // bright flash core early in the burst
    float flash = smoothstep(0.08, 0.0, t) * 1.5;
    vec2 delta2 = uv - center;
    if (!isRoofline) {
      delta2.y *= RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
    }
    float dc = length(delta2);
    col += burstColor * smoothstep(0.06, 0.0, dc) * flash;
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
