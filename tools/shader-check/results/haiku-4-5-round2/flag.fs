/*{
  "DESCRIPTION": "American flag waving with stars and stripes",
  "CREDIT": "webXLights shader assistant",
  "CATEGORIES": ["Generator"],
  "INPUTS": [
    { "NAME": "waveAmplitude", "TYPE": "float", "MIN": 0.0, "MAX": 0.3, "DEFAULT": 0.1 },
    { "NAME": "waveFrequency", "TYPE": "float", "MIN": 0.5, "MAX": 4.0, "DEFAULT": 2.0 },
    { "NAME": "speed", "TYPE": "float", "MIN": 0.1, "MAX": 3.0, "DEFAULT": 1.0 }
  ]
}*/

void main() {
  vec2 uv = isf_FragNormCoord;
  
  float wavePhase = TIME * speed;
  float wave = sin(uv.y * waveFrequency * 3.14159 + wavePhase) * waveAmplitude;
  float distortedX = uv.x + wave * (1.0 - uv.x);
  
  vec3 color = vec3(0.0);
  
  if (distortedX < 0.0) {
    color = vec3(0.0);
  } else if (distortedX < 0.2) {
    float starY = uv.y * 9.0;
    float starX = distortedX * 50.0;
    float starPattern = mod(floor(starX) + floor(starY), 2.0);
    float starDot = sin(starX * 3.14159) * sin(starY * 3.14159);
    if (starPattern > 0.5 && starDot > 0.5) {
      color = vec3(1.0, 1.0, 1.0);
    } else {
      color = vec3(0.0, 0.2, 0.5);
    }
  } else {
    float stripeIndex = floor(uv.y * 13.0);
    float isRed = mod(stripeIndex, 2.0);
    if (isRed > 0.5) {
      color = vec3(1.0, 0.0, 0.0);
    } else {
      color = vec3(1.0, 1.0, 1.0);
    }
  }
  
  gl_FragColor = vec4(color, 1.0);
}
