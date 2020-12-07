export default {
  source: `
{
  "name": "myAmazingFlow",
  "flows": {
    "firstFlow": {
      "jobs": [
        {
          "location": "/Projects/job1"
        },
        {
          "location": "/Projects/job2"
        },
        {
          "location": "/Projects/job3"
        }
      ],
      "predecessors": []
    },
    "secondFlow": {
      "jobs": [
        {
          "location": "/Projects/job11"
        }
      ],
      "predecessors": [
        "firstFlow"
      ]
    },
    "anotherFlow": {
      "jobs": [
        {
          "location": "/Public/job15"
        }
      ],
      "predecessors": [
        "firstFlow",
        "secondFlow"
      ]
    },
    "yetAnotherFlow": {
      "jobs": [
        {
          "location": "/Public/job115"
        }
      ],
      "predecessors": []
    }
  }
}
`
}
