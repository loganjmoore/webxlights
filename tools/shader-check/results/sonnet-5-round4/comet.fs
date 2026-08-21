/*{
  "DESCRIPTION": "A glowing comet with a long fading tail circles around the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.9, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.1, 0.0, 0.3, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.0 },
    { "NAME": "tailLength", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.55 },
    { "NAME": "cometSize", "TYPE": "float", "MIN": 0.02, "MAX": 0.3, "DEFAULT": 0.1 }
  ]
}*/
void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  float ang = TIME * speed * 1.3;
  float headAngle = mod(ang, 6.28318530718);

  vec2 pos;
  float coord;

  if (isFlat) {
    // drive purely along x when the model is a single row
    coord = fract(uv.x - TIME * speed * 0.25);
  } else {
    // map pixel to angle around the center
    vec2 centered = uv - vec2(0.5);
    centered.x *= RENDERSIZE.x / RENDERSIZE.y;
    float pixAngle = atan(centered.y, centered.x);
    if (pixAngle < 0.0) pixAngle += 6.28318530718;
    coord = pixAngle / 6.28318530718;
  }

  float headCoord = isFlat ? fract(-TIME * speed * 0.25) : (headAngle / 6.28318530718);

  // distance behind the head, wrapping
  float d = fract(headCoord - coord);

  // tail fades out over tailLength, head is brightest at d=0
  float tailFalloff = 1.0 - smoothstep(0.0, tailLength, d);

  // sharpen head with an extra boost near d=0
  float headGlow = smoothstep(cometSize, 0.0, d);
  float brightness = clamp(tailFalloff + headGlow * 1.5, 0.0, 1.6);

  vec3 col = mix(colorB.rgb, colorA.rgb, clamp(brightness, 0.0, 1.0));
  col += colorA.rgb * headGlow * 0.6;

  // background floor so it isn't pure black between comet passes
  vec3 bg = colorB.rgb * 0.08;
  vec3 finalColor = mix(bg, col, clamp(brightness, 0.0, 1.0));

  gl_FragColor = vec4(finalColor, 1.0);
}
