/*{
  "DESCRIPTION": "A warm sunrise glow slowly rises from the bottom of the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.6, 0.1, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.6, 1.0] },
    { "NAME": "skyColor", "TYPE": "color", "DEFAULT": [0.05, 0.02, 0.1, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 0.5 },
    { "NAME": "softness", "TYPE": "float", "MIN": 0.05, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;

  // pick the axis that actually shows motion: y normally,
  // x when the buffer is a flat roofline (height < 2px)
  float pos = (RENDERSIZE.y < 2.0) ? uv.x : uv.y;

  // slow endless rise, looping smoothly by wrapping 0..1
  float cycle = fract(TIME * speed * 0.05);

  // horizon starts low and climbs, wraps back down for a seamless loop
  float horizon = cycle * 1.6 - 0.3;

  float edge = softness * 0.5 + 0.05;

  // glow band around the horizon: bright core fading into sky
  float d = pos - horizon;

  // core sun glow - brightest right at horizon, fading upward and downward
  float glow = smoothstep(edge, -edge, abs(d) - edge);

  // gradient from colorA (deep horizon) to colorB (higher glow) above horizon
  float riseMix = clamp((pos - horizon) / (edge * 3.0) + 0.5, 0.0, 1.0);
  vec3 sunGlow = mix(colorA.rgb, colorB.rgb, riseMix);

  // below horizon stays dark sky, above fades glow into sky color with height
  float above = smoothstep(horizon - edge, horizon + edge * 2.5, pos);
  vec3 col = mix(skyColor.rgb, sunGlow, glow);
  col = mix(col, skyColor.rgb, above * above * 0.85);

  // keep a warm floor near the horizon even as it climbs, for punch
  float horizonPunch = smoothstep(edge * 1.5, 0.0, abs(pos - horizon));
  col = mix(col, colorA.rgb, horizonPunch * 0.5);

  gl_FragColor = vec4(col, 1.0);
}
