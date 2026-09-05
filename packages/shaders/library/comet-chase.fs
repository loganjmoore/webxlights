/*{
  "DESCRIPTION": "A bright comet with a long glowing tail chasing itself around the display",
  "CREDIT": "webXLights",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.1, 0.4, 1.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.2, "MAX": 0.9, "DEFAULT": 0.7 },
    { "NAME": "glow", "TYPE": "float", "MIN": 0.0, "MAX": 0.4, "DEFAULT": 0.22 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isLine = RENDERSIZE.y < 2.0;
  float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  // 20 pi: one orbit per 2 pi seconds at speed 1, and the wrap lands exactly on a whole orbit.
  float t = mod(TIME * speed, 62.831853);

  float back;   // how far behind the head this pixel is, 0..1 around the loop
  float onPath; // 1 on the comet's track, 0 off it
  float head;   // the bright head itself
  if (isLine) {
    float pos = fract(t / 6.2831853);
    back = fract(pos - uv.x);
    onPath = 1.0;
    head = smoothstep(0.06, 0.0, abs(uv.x - pos));
  } else {
    float r = length(p);
    float radius = 0.34 * min(aspect, 1.0);
    float a = atan(p.y, p.x);
    back = fract((t - a) / 6.2831853);
    onPath = smoothstep(0.14, 0.04, abs(r - radius));
    vec2 headPos = vec2(cos(t), sin(t)) * radius;
    head = smoothstep(0.13, 0.0, length(p - headPos));
  }
  // The tail is what moves: it is a function of the head's position, so it reaches the output.
  float tail = pow(clamp(1.0 - back / tailLength, 0.0, 1.0), 2.2) * onPath;
  vec3 col = colorA.rgb * (tail + glow);
  col = mix(col, colorB.rgb, head);
  gl_FragColor = vec4(col, 1.0);
}
