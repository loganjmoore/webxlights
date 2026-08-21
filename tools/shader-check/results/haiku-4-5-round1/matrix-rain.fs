/*{
  "DESCRIPTION": "Green streaks falling like digital rain across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "colorA", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "colorB", "TYPE": "color", "DEFAULT": [0.0, 0.5, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 8.0, "DEFAULT": 3.0 },
    { "NAME": "streakLength", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float column = floor(uv.x * density);
  float seed = fract(sin(column * 12.9898) * 43758.5453);
  
  float fallPos = fract(uv.y + TIME * speed * 0.5 + seed);
  
  float streak = smoothstep(fallPos + streakLength, fallPos - 0.02, uv.y + TIME * speed * 0.5 + seed);
  streak *= smoothstep(-0.05, 0.1, fallPos);
  
  vec3 rainColor = mix(colorB.rgb, colorA.rgb, sin(fallPos * 3.14159) * 0.5 + 0.5);
  
  gl_FragColor = vec4(rainColor * streak, 1.0);
}
