/*{
  "DESCRIPTION": "Spinning tunnel of concentric rings flying toward the viewer",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "rings", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "twist", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 }
  ]
}*/
void main() {
  vec2 uv;
  bool isFlat = RENDERSIZE.y < 2.0;

  if (isFlat) {
    // one-pixel-tall model: fake the tunnel by sliding along x instead of radius
    float x = isf_FragNormCoord.x;
    float t = TIME * speed;

    float radial = fract(x * rings - t * 1.5);
    float ring = smoothstep(0.0, 0.12, radial) - smoothstep(0.38, 0.5, radial);

    float spin = sin(x * 6.2831 * twist + t * 3.0);
    float mixer = 0.5 + 0.5 * spin;

    vec3 base = mix(colorA.rgb, colorB.rgb, mixer);
    vec3 col = mix(base, colorC.rgb, ring);

    // pulse brightness along x to read as depth motion
    float pulse = 0.6 + 0.4 * sin(x * 6.2831 - t * 4.0);
    col *= pulse;

    gl_FragColor = vec4(col, 1.0);
    return;
  }

  // normalize coords to centered -1..1, correct aspect
  vec2 res = RENDERSIZE;
  uv = (isf_FragNormCoord - 0.5) * 2.0;
  uv.x *= res.x / res.y;

  float t = TIME * speed;

  float radius = length(uv);
  float angle = atan(uv.y, uv.x);

  // spin the angle over time, twist controls how tightly rings spiral
  float spinAngle = angle + t * 1.2;

  // avoid divide by zero: radius can be 0 at dead center, add small epsilon
  float invR = 1.0 / (radius + 0.15);

  // rings flying toward viewer: pattern moves in +invR direction over time
  float pattern = fract(invR * (rings * 0.5) + spinAngle * twist * 0.3 - t * 1.8);
  float ringMask = smoothstep(0.0, 0.1, pattern) - smoothstep(0.4, 0.55, pattern);

  // color cycles by angle and depth for a spinning look
  float colorPhase = spinAngle * 1.5 + invR * 0.5;
  float mixer = 0.5 + 0.5 * sin(colorPhase);
  vec3 base = mix(colorA.rgb, colorB.rgb, mixer);

  vec3 col = mix(base * 0.35, colorC.rgb, ringMask);

  // darken toward center for depth illusion, brighten outer glow slightly
  float depthShade = clamp(radius * 0.8 + 0.25, 0.0, 1.0);
  col *= depthShade;

  gl_FragColor = vec4(col, 1.0);
}
