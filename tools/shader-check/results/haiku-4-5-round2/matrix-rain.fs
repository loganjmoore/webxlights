/*{
  "DESCRIPTION": "Green streaks fall like digital rain across the display",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "rainColor", "TYPE": "color", "DEFAULT": [0.0, 1.0, 0.0, 1.0] },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.0, "MAX": 4.0, "DEFAULT": 1.5 },
    { "NAME": "density", "TYPE": "float", "MIN": 0.1, "MAX": 1.0, "DEFAULT": 0.6 },
    { "NAME": "streakLength", "TYPE": "float", "MIN": 0.05, "MAX": 0.5, "DEFAULT": 0.2 }
  ]
}*/

float hash(float n) {
  return fract(sin(n * 43758.5453) * 43758.5453);
}

float hashVec(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float animY;
  if (RENDERSIZE.y < 2.0) {
    animY = mod(uv.x * 8.0 - TIME * speed, 1.0);
  } else {
    animY = mod(uv.y * 8.0 - TIME * speed, 1.0);
  }
  
  float column = floor(uv.x * 16.0);
  float seed = hash(column + 100.0);
  
  float offset = fract(seed * 12.34);
  float activeColumn = step(density, fract(seed));
  
  float streak = smoothstep(0.0, streakLength * 0.5, animY) * 
                 smoothstep(streakLength * 1.5, streakLength, animY);
  
  float brightness = streak * activeColumn;
  
  gl_FragColor = vec4(rainColor.rgb * brightness, 1.0);
}
