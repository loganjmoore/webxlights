/*{
  "DESCRIPTION": "A warm sunrise glow slowly rises from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.1, 0.2, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.02, 0.02, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.05, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // Slowly rising horizon, loops seamlessly by wrapping 0..1
  float riseSpeed = speed * 0.05;
  float horizon = fract(TIME * riseSpeed);
  // ease so it feels like it lingers near rise, matches natural sunrise pace
  horizon = smoothstep(0.0, 1.0, horizon);

  // On tall/narrow displays (roofline), drive the same motion along x
  float pos = mix(uv.y, uv.x, step(RENDERSIZE.y, 1.5));

  float d = pos - horizon;
  float soft = max(softness, 0.05);

  // Sky above horizon: gradient from colorA near horizon to colorC (night sky) far above
  float skyMix = smoothstep(0.0, soft * 3.0, d);
  vec3 sky = mix(colorA.rgb, colorC.rgb, skyMix);

  // Glow band right at horizon: colorB warm glow, brightest right at the rising edge
  float glow = 1.0 - smoothstep(0.0, soft, abs(d));
  vec3 col = mix(sky, colorB.rgb, glow * 0.85);

  // Below horizon: darker version of colorB fading to colorC (still night below)
  float belowMix = smoothstep(0.0, soft * 2.0, -d);
  vec3 below = mix(colorB.rgb * 0.5, colorC.rgb, belowMix);
  col = mix(col, below, step(pos, horizon));

  // Overall brightness boost near the horizon line for punch
  float boost = 1.0 - smoothstep(0.0, soft * 0.5, abs(d));
  col += colorA.rgb * boost * 0.3;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
