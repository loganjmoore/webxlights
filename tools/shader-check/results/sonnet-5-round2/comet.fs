/*{
  "DESCRIPTION": "A glowing comet circles the display with a long fading tail",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.3, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.0, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.05, "MAX": 0.9, "DEFAULT": 0.4 },
    { "NAME": "thickness", "TYPE": "float", "MIN": 0.05, "MAX": 1.0, "DEFAULT": 0.35 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float phase = fract(TIME * speed * 0.15);
  float ang = phase * 6.28318530718;

  vec3 bg = colorB.rgb * 0.15;
  vec3 col = bg;

  if (isFlat) {
    // roofline: comet travels along x, wrapping seamlessly
    float pos = fract(TIME * speed * 0.2);
    float d = fract(uv.x - pos + 1.5) - 0.5;
    d = abs(d);
    float tail = smoothstep(tailLength, 0.0, d);
    // sharpen head
    float head = smoothstep(0.03 * thickness + 0.01, 0.0, d);
    float glow = max(tail * tail, head);
    col = mix(bg, colorA.rgb, clamp(glow, 0.0, 1.0));
  } else {
    // 2D circling comet
    vec2 center = vec2(0.5, 0.5);
    vec2 p = uv - center;
    p.x *= RENDERSIZE.x / RENDERSIZE.y;

    float radius = 0.35;
    float pang = atan(p.y, p.x);
    float pr = length(p);

    // distance from ring
    float ringDist = abs(pr - radius);
    float ringMask = smoothstep(thickness * 0.25 + 0.02, 0.0, ringDist);

    // angular distance behind the comet head for tail
    float da = mod(ang - pang + 6.28318530718, 6.28318530718);
    float tailFall = smoothstep(tailLength * 6.28318530718, 0.0, da);

    float head = smoothstep(0.35, 1.0, 1.0 - da / 0.25);
    head = clamp(head, 0.0, 1.0);

    float glow = ringMask * max(tailFall * tailFall, head * 1.2);
    glow = clamp(glow, 0.0, 1.0);

    col = mix(bg, colorA.rgb, glow);
  }

  gl_FragColor = vec4(col, 1.0);
}
