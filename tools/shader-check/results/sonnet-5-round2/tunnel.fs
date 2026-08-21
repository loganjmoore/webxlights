/*{
  "DESCRIPTION": "A spinning tunnel of colored rings that pulls you inward",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [1.0, 1.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "spin", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "rings", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 }
  ]
}*/
void main() {
  vec2 res = RENDERSIZE;
  vec2 uv;

  if (res.y < 2.0) {
    // single row of lights: fake the tunnel by mapping x to angle
    // and using time as the "depth" axis so motion still reads along x
    float ang = uv.x;
    uv = isf_FragNormCoord;
    float a = uv.x * 6.2831853;
    float depth = fract(TIME * speed * 0.3);
    float rr = fract(depth * rings + a * 0.5);
    float band = smoothstep(0.0, 0.08, rr) - smoothstep(0.42, 0.5, rr);
    vec3 col = mix(colorA.rgb, colorB.rgb, step(0.5, fract(a / 6.2831853 * 2.0 + depth)));
    col = mix(col, colorC.rgb, band);
    gl_FragColor = vec4(col, 1.0);
    return;
  }

  uv = isf_FragNormCoord * 2.0 - 1.0;
  uv.x *= res.x / max(res.y, 1.0);

  float r = length(uv) + 0.0001;
  float a = atan(uv.y, uv.x);

  // spin the angle over time
  a += TIME * spin;

  // depth coordinate: inverse radius creates the flying-forward feel
  float depth = 1.0 / r - TIME * speed * 2.0;

  float ringPattern = fract(depth * (rings * 0.1));
  float ringMask = smoothstep(0.0, 0.1, ringPattern) - smoothstep(0.5, 0.6, ringPattern);

  // color banding around the angle, shifting with depth for spiral feel
  float colorPhase = fract(a / 6.2831853 * 3.0 + depth * 0.15);
  vec3 baseCol = mix(colorA.rgb, colorB.rgb, step(0.5, colorPhase));

  vec3 col = mix(baseCol * 0.25, colorC.rgb, ringMask);

  // darken toward center a touch less, brighten near mid-tunnel for depth cue
  float vign = smoothstep(1.6, 0.1, r);
  col *= mix(0.6, 1.2, vign);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
