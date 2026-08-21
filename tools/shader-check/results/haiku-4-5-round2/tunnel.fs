/*{
  "DESCRIPTION": "A spinning tunnel of colored lights that rotates around the center as you fly through it",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [1.0, 0.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorC", "TYPE": "color", "DEFAULT": [0.0, 0.0, 1.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "segments", "TYPE": "float", "MIN": 3.0, "MAX": 16.0, "DEFAULT": 8.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord - 0.5;
  float angle = atan(uv.y, uv.x);
  float radius = length(uv);
  
  float tunnelDepth = fract(radius * 3.0 - TIME * speed * 0.5);
  float segmentAngle = fract((angle / 6.28318530718) + TIME * speed * 0.3);
  float whichSegment = mod(floor(segmentAngle * segments), 3.0);
  
  float brightness = 1.0 - smoothstep(0.35, 0.5, radius);
  brightness *= smoothstep(0.0, 0.1, tunnelDepth) * smoothstep(1.0, 0.85, tunnelDepth);
  
  vec3 col;
  if (whichSegment < 1.0) {
    col = colorA.rgb;
  } else if (whichSegment < 2.0) {
    col = colorB.rgb;
  } else {
    col = colorC.rgb;
  }
  
  col *= brightness;
  gl_FragColor = vec4(col, 1.0);
}
