/*{
  "DESCRIPTION": "Colorful fireworks bursting with rings and sparkling dots",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.2, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.1, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.2, 0.6, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "bursts", "TYPE": "long", "MIN": 1, "MAX": 12, "DEFAULT": 6 }
  ]
}*/
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec2 hash22(vec2 p) {
  return vec2(hash21(p + vec2(1.0, 0.0)), hash21(p + vec2(0.0, 1.0)));
}
void main() {
  vec2 uv = isf_FragNormCoord;
  // For rooflines, drive animation along x when height is tiny
  vec2 p = uv;
  if (RENDERSIZE.y < 2.0) {
    p.y = uv.x;
  }
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  const int MAX_BURSTS = 12;
  vec3 accum = vec3(0.0);
  const float PI = 3.14159265;
  const float TWO_PI = 6.2831853;
  for (int i = 0; i < MAX_BURSTS; i++) {
    if (i >= int(bursts)) {
      break;
    }
    float fi = float(i);
    // seed positions, bias to upper half for bursts
    float cx = hash21(vec2(fi * 12.989, 78.233));
    float cy = hash21(vec2(fi * 39.346, 11.135));
    vec2 center = vec2(cx, 0.25 + 0.6 * cy);
    float phase = hash21(vec2(fi * 5.23, 95.32));
    // cycle per burst, repeats smoothly
    float cycle = fract(TIME * speed * 0.25 + phase);
    float duration = 0.45;
    if (cycle < duration) {
      float localT = cycle / duration; // 0..1 for this burst's life
      // randomized final radius and thickness
      float radBase = 0.12 + 0.45 * hash21(vec2(fi, 3.21));
      float radius = localT * radBase;
      float thickness = 0.02 * (0.4 + 0.9 * hash21(vec2(fi, 7.0)));
      // distance in aspect-correct space
      vec2 d = (p - center) * vec2(aspect, 1.0);
      float dist = length(d);
      // bright expanding ring
      float ring = smoothstep(radius + thickness, radius - thickness, dist);
      // small bright core at earliest moment
      float core = smoothstep(0.01, 0.0, dist) * smoothstep(0.15, 0.0, 1.0 - localT);
      // sparkling dots arranged around the ring
      float angle = atan(d.y, d.x);
      float segF = floor((angle + PI) / TWO_PI * 18.0);
      float dotSeed = hash21(vec2(segF, fi * 7.0));
      float dotRadius = radius * (0.85 + 0.45 * dotSeed);
      float dot = smoothstep(0.03, 0.0, abs(dist - dotRadius));
      dot *= dotSeed;
      // additional radial spikes (subtle)
      float spikes = pow(max(0.0, cos(angle * (3.0 + 6.0 * hash21(vec2(fi, 2.0))) + phase * 6.2831853)), 8.0);
      spikes *= smoothstep(radius + 0.03, radius - 0.02, dist);
      // life-based brightness envelope (bright early, fades)
      float lifeBright = (1.0 - localT);
      lifeBright = pow(lifeBright, 1.2);
      // color selection per burst from the three user colors
      float mixA = hash21(vec2(fi, 1.0));
      float mixB = hash21(vec2(fi, 2.0));
      vec3 burstCol = mix(colorA.rgb, colorB.rgb, mixA);
      burstCol = mix(burstCol, colorC.rgb, mixB);
      // combine elements
      float intensity = (ring * 1.0 + dot * 0.9 + core * 1.6 + spikes * 0.6) * lifeBright;
      accum += burstCol * intensity * 1.8;
    }
  }
  // small global twinkle to suggest distant sparks
  float tw = hash21(uv * 234.5 + vec2(TIME * 0.5));
  float tiny = smoothstep(0.995, 1.0, tw) * 0.6;
  vec3 twCol = mix(colorB.rgb, colorC.rgb, hash21(uv * 12.3));
  accum += twCol * tiny;
  // tone mapping and clamp
  accum = clamp(accum, 0.0, 1.0);
  gl_FragColor = vec4(accum, 1.0);
}
