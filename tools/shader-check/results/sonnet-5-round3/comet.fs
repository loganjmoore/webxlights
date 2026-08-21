/*{
  "DESCRIPTION": "A comet with a fading tail sweeps around the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.4, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.0, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.05, "MAX": 0.9, "DEFAULT": 0.4 },
    { "NAME": "cometSize", "TYPE": "float", "MIN": 0.01, "MAX": 0.3, "DEFAULT": 0.08 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isRoofline = RENDERSIZE.y < 2.0;

  float pos;
  float dist;

  if (isRoofline) {
    // drive purely along x, comet bounces back and forth for a "circling" feel
    float t = fract(TIME * speed * 0.15);
    float phase = t * 2.0;
    float x = phase < 1.0 ? phase : 2.0 - phase;
    dist = abs(uv.x - x);
  } else {
    // circle around the canvas center
    vec2 center = vec2(0.5, 0.5);
    vec2 p = uv - center;
    float aspect = RENDERSIZE.x / max(RENDERSIZE.y, 1.0);
    p.x *= aspect;

    float ang = atan(p.y, p.x);
    float radius = 0.35;

    float cometAngle = TIME * speed * 1.2;
    vec2 cometDir = vec2(cos(cometAngle), sin(cometAngle));
    vec2 cometPos = cometDir * radius;
    cometPos.x /= aspect;

    vec2 d = uv - center - vec2(cometPos.x * aspect, cometPos.y);
    dist = length(d);

    // angular distance for tail, wrapped to -PI..PI
    float da = ang - cometAngle;
    da = mod(da + 3.14159265, 6.2831853) - 3.14159265;

    // only show tail behind the comet direction of travel
    float tailFalloff = 0.0;
    if (da > 0.0) {
      float tailAmt = 1.0 - clamp(da / (tailLength * 3.14159265), 0.0, 1.0);
      tailFalloff = tailAmt * tailAmt;
    }

    float ringDist = abs(length(p) - radius);
    float tailGlow = tailFalloff * smoothstep(cometSize * 2.0, 0.0, ringDist);

    float head = smoothstep(cometSize, 0.0, dist);
    float b = clamp(head + tailGlow, 0.0, 1.0);

    vec3 col = mix(colorB.rgb, colorA.rgb, b);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  float head = smoothstep(cometSize, 0.0, dist);
  vec3 col = mix(colorB.rgb, colorA.rgb, head);
  gl_FragColor = vec4(col, 1.0);
}
