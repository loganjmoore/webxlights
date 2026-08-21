/*{
  "DESCRIPTION": "Bursts of colored fireworks explode outward and fade in a repeating cycle",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.3, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.2, 0.6, 1.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bursts", "TYPE": "long", "MIN": 1, "MAX": 6, "DEFAULT": 3 }
  ]
}*/

float hash1(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

vec3 burstColor(float id) {
  float m = mod(id, 3.0);
  if (m < 1.0) return colorA.rgb;
  if (m < 2.0) return colorB.rgb;
  return colorC.rgb;
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  vec3 col = vec3(0.0);
  float cycle = 2.2;

  for (int i = 0; i < 6; i++) {
    if (i >= bursts) break;
    float fi = float(i);

    float offset = hash1(fi + 1.0) * cycle;
    float t = mod(TIME * speed + offset, cycle);
    float life = t / cycle;

    float cx = hash1(fi * 3.1 + 5.0);
    float cy = isRoofline ? 0.5 : (0.35 + 0.4 * hash1(fi * 7.7 + 2.0));

    vec2 center = vec2(cx, cy);

    float radius = life * 0.55;
    float thickness = 0.06 + 0.05 * (1.0 - life);
    float fade = smoothstep(1.0, 0.0, life);

    if (isRoofline) {
      float d = abs(uv.x - center.x);
      float ring = smoothstep(thickness, 0.0, abs(d - radius));
      col += burstColor(fi) * ring * fade;
    } else {
      float ang = hash1(fi * 13.0) * 6.2831;
      const int SPARKS = 8;
      for (int s = 0; s < SPARKS; s++) {
        float fs = float(s);
        float a = ang + fs * (6.2831 / float(SPARKS));
        vec2 dir = vec2(cos(a), sin(a));
        vec2 pos = center + dir * radius;
        float d = length(uv - pos);
        float spark = smoothstep(thickness, 0.0, d);
        col += burstColor(fi) * spark * fade;
      }
    }
  }

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
