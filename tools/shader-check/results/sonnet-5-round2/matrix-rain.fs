/*{
  "DESCRIPTION": "Green digital rain streaks fall down the display like falling code",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.2, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.3, 0.05, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 2.0, "MAX": 16.0, "DEFAULT": 8.0 },
    { "NAME": "streakLength", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.4 }
  ]
}*/
float hash11(float x) {
  return fract(sin(x * 127.1) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  bool isFlat = RENDERSIZE.y < 2.0;

  // pick the axis that carries the fall motion and the axis that separates streaks
  float along = isFlat ? uv.x : uv.y;
  float across = isFlat ? uv.y : uv.x;

  float lanes = density;
  float lane = floor(across * lanes);
  float laneFrac = fract(across * lanes);

  float laneSeed = hash11(lane + 1.0);
  float laneSpeed = 0.5 + laneSeed * 1.5;
  float offset = hash11(lane + 50.0);

  // falling coordinate, wraps seamlessly, direction reversed for flat (falls toward +x)
  float fall = fract(along + offset - TIME * speed * laneSpeed * 0.3);
  if (isFlat) {
    fall = fract((1.0 - along) + offset - TIME * speed * laneSpeed * 0.3);
  }

  float len = clamp(streakLength, 0.05, 1.0);
  float head = smoothstep(0.0, 0.05, fall) * (1.0 - smoothstep(len * 0.6, len, fall));

  // brighten near the head, fade along the tail
  float brightness = head * (1.0 - fall / max(len, 0.01));
  brightness = clamp(brightness, 0.0, 1.0);

  // keep streaks narrow within their lane
  float streakWidth = smoothstep(0.0, 0.15, laneFrac) * (1.0 - smoothstep(0.55, 0.75, laneFrac));

  float glow = brightness * streakWidth;
  vec3 col = mix(colorB.rgb * 0.3, colorA.rgb, glow);
  col *= max(glow, 0.06);

  gl_FragColor = vec4(col, 1.0);
}
